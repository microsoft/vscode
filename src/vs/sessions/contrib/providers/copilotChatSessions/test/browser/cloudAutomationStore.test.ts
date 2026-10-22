/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { useFakeTimers } from 'sinon';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { autorun, constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatAIDisabledSettingId } from '../../../../../../platform/chat/common/chatSettings.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { AutomationDetail, AutomationRepositoryConfiguration, AutomationToolGroup, AutomationTriggerDefinition, CreateAutomationRequest, CreateAutomationTaskRequest, CreateAutomationTaskResponse, EditAutomationRequest, IAutomationsClient, ListRepoAutomationsResponse } from '../../../../../../platform/github/common/missionControl/automations.js';
import { ApiRequestError, MutationUncertainError } from '../../../../../../platform/github/common/missionControl/missionControlClient.js';
import { ITasksClient, ListTasksResponse, Task, TaskListOptions } from '../../../../../../platform/github/common/missionControl/tasks.js';
import { IGitHubAccountClient } from '../../../../../../platform/github/common/account/account.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IGitHubService } from '../../../../github/browser/githubService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAutomationSchedule, IAutomationSessionTemplate } from '../../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationMutationUncertainError, AutomationUnavailableError } from '../../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING, CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING } from '../../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IToolImpl } from '../../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IWorkbenchGitHubService } from '../../../../../../workbench/services/github/common/githubService.js';
import { ISessionsRecentWorkspacesService } from '../../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISession, ISessionType } from '../../../../../services/sessions/common/session.js';
import { AutomationSessionDraftSynchronizer } from '../../../../automations/browser/automationDialog.js';
import { ConfigureAutomationTool, DeleteAutomationTool, ListAutomationsTool, RunAutomationTool } from '../../../../automations/browser/automationTools.js';
import { AutomationRunner } from '../../../../automations/browser/automationRunner.js';
import { ProviderAutomationService } from '../../../../automations/browser/providerAutomationService.js';
import { CloudAutomationStore, cloudAutomationSchedule, cloudAutomationTriggers } from '../../browser/cloudAutomationStore.js';
import { IRepositoryPickResult, RepositoryPicker } from '../../../../../../workbench/contrib/chat/browser/agentSessions/repositoryPicker.js';
import { RepositoryRef } from '../../../../../../platform/github/common/client/types.js';
import { PaginatedResponse } from '../../../../../../platform/github/common/missionControl/missionControl.js';

const definition: AutomationDetail = { id: 'one', name: 'Review', description: '', created_by: { login: 'user' }, prompt: 'Review issues', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', triggers: {} };
const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/owner/private/HEAD' });
const account: IDefaultAccount = { accountName: 'user', sessionId: 'one', enterprise: false, authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false } };
const manual: IAutomationSchedule = { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
const reconciliationMessage = 'The automation request may have been accepted. Refresh automations before submitting again.';

class TestApi extends mock<IAutomationsClient>() {
	readonly historyOptions: (TaskListOptions | undefined)[] = [];
	readonly calls: string[] = [];
	readonly configurationRepositories: string[] = [];
	activeConfigurations = 0;
	maxActiveConfigurations = 0;
	definitions: readonly AutomationDetail[] = [definition];
	tasks: readonly Task[] = [];
	listError: Error | undefined;
	historyError: Error | undefined;
	readonly historyErrors = new Map<string, Error>();
	pendingHistory: Promise<void> | undefined;
	getError: Error | undefined;
	createError: Error | undefined;
	updateError: Error | undefined;
	deleteError: Error | undefined;
	dispatchError: Error | undefined;
	readonly dispatchRequests: CreateAutomationTaskRequest[] = [];
	pendingList: Promise<void> | undefined;
	pendingManageability: Promise<boolean> | undefined;
	readonly manageabilityStarted = new DeferredPromise<void>();
	lastSignal: AbortSignal | undefined;
	patch: EditAutomationRequest | undefined;
	created: CreateAutomationRequest | undefined;
	canManage = true;
	readonly repositoryManageability = new Map<string, boolean | Error>();
	override async getConfiguration(repository: RepositoryRef, signal: AbortSignal): Promise<AutomationRepositoryConfiguration> {
		this.calls.push('capability');
		this.configurationRepositories.push(repository.repo);
		this.lastSignal = signal;
		await this.manageabilityStarted.complete();
		this.maxActiveConfigurations = Math.max(this.maxActiveConfigurations, ++this.activeConfigurations);
		try {
			const result = this.repositoryManageability.get(repository.repo);
			if (result instanceof Error) {
				throw result;
			}
			return {
				automations_enabled: true,
				can_manage_automations: result ?? await this.pendingManageability ?? this.canManage,
				allow_read_access_triggers: false,
				require_trigger_scoped_writes: false,
			};
		} finally {
			this.activeConfigurations--;
		}
	}
	override async list(): Promise<PaginatedResponse<ListRepoAutomationsResponse>> {
		this.calls.push('list');
		await this.pendingList;
		if (this.listError) {
			throw this.listError;
		}
		return { data: { automations: this.definitions, total_count: this.definitions.length } };
	}
	override async listRuns(id: string, _signal: AbortSignal, options?: TaskListOptions): Promise<PaginatedResponse<ListTasksResponse>> {
		this.historyOptions.push(options);
		this.calls.push('history');
		await this.pendingHistory;
		const error = this.historyErrors.get(id) ?? this.historyError;
		if (error) {
			throw error;
		}
		return { data: { tasks: this.tasks } };
	}
	override async get(_repository: RepositoryRef, id: string): Promise<AutomationDetail> {
		if (this.getError) {
			throw this.getError;
		}
		return this.definitions.find(definition => definition.id === id)!;
	}
	override async create(_repository: RepositoryRef, value: CreateAutomationRequest): Promise<AutomationDetail> {
		this.calls.push('create');
		this.created = value;
		if (this.createError) {
			throw this.createError;
		}
		return { ...definition, ...value };
	}
	override async update(_repository: RepositoryRef, id: string, value: EditAutomationRequest): Promise<AutomationDetail> {
		this.patch = value;
		this.calls.push('update');
		if (this.updateError) {
			throw this.updateError;
		}
		return { ...this.definitions.find(definition => definition.id === id)!, ...value };
	}
	override async delete(): Promise<void> {
		this.calls.push('delete');
		if (this.deleteError) {
			throw this.deleteError;
		}
	}
	override async dispatch(_repository: RepositoryRef, _id: string, request: CreateAutomationTaskRequest): Promise<CreateAutomationTaskResponse> {
		this.calls.push('run');
		this.dispatchRequests.push(request);
		if (this.dispatchError) {
			throw this.dispatchError;
		}
		return {};
	}
	toolsError: Error | undefined;
	triggersError: Error | undefined;
	triggerDefinitions: readonly AutomationTriggerDefinition[] = [{ name: 'issues', title: 'Issue created', description: '', fields: [{ name: 'types', required: true, options: ['opened'] }] }];
	override async listTriggers(): Promise<readonly AutomationTriggerDefinition[]> {
		this.calls.push('triggers');
		if (this.triggersError) {
			throw this.triggersError;
		}
		return this.triggerDefinitions;
	}
	override async listTools(): Promise<readonly AutomationToolGroup[]> {
		this.calls.push('tools');
		if (this.toolsError) {
			throw this.toolsError;
		}
		return [
			{ id: 'issues', name: 'Issues', tools: [{ id: 'github/issue_read', name: 'Read issue', description: 'Read an issue.' }, { id: 'github/list_issues', title: 'List issues', description: '' }] },
			{ id: 'untitled', tools: [{ id: 'github/unnamed', description: '' }] },
		];
	}
}

suite('CloudAutomationStore', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	function setup(logService: ILogService = new NullLogService(), clientNotificationOrder?: 'before' | 'after', gitHubService: IGitHubService = upcastPartial<IGitHubService>({}), initialAccount?: DeferredPromise<IDefaultAccount | null>) {
		const instantiation = disposables.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ chat: { automations: { enabled: true, cloud: { enabled: false } } } });
		const changed = disposables.add(new Emitter<IDefaultAccount | null>());
		const clientChanged = disposables.add(new Emitter<void>());
		if (clientNotificationOrder === 'before') {
			disposables.add(changed.event(() => clientChanged.fire()));
		}
		const accounts = new class extends mock<IDefaultAccountService>() {
			override currentDefaultAccount: IDefaultAccount | null = initialAccount ? null : account;
			override onDidChangeDefaultAccount = changed.event;
			override async getDefaultAccount(): Promise<IDefaultAccount | null> {
				if (initialAccount) {
					this.currentDefaultAccount = await initialAccount.p;
				}
				return this.currentDefaultAccount;
			}
		}();
		const sentimentChanged = disposables.add(new Emitter<void>());
		const entitlement = new class extends mock<IChatEntitlementService>() {
			override sentiment: IChatSentiment = {};
			override onDidChangeSentiment = sentimentChanged.event;
		}();
		const api = new TestApi();
		const credentialLifetime = new AbortController();
		const client = new class extends mock<IGitHubAccountClient>() {
			override readonly onDidInvalidate = Event.None;
			override readonly onDidChangeCredentials = Event.fromDOMEventEmitter<void>(credentialLifetime.signal, 'abort');
			override dispose(): void { }
			override readonly authorization = { providerId: 'github', sessionId: account.sessionId, scopes: ['repo'] };
			override readonly automations = api;
			override readonly tasks = new class extends mock<ITasksClient>() {
				override async get() { return api.tasks[0]; }
				override async abort() { api.calls.push('stop'); }
			}();
		}();
		instantiation.stub(IWorkbenchGitHubService, new class extends mock<IWorkbenchGitHubService>() {
			override readonly onDidChangeDefaultClient = clientChanged.event;
			override async acquireDefaultAccountApiClient() { return client; }
		}());
		instantiation.stub(IInstantiationService, instantiation);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IDefaultAccountService, accounts);
		instantiation.stub(IChatEntitlementService, entitlement);
		instantiation.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiation.stub(ILogService, logService);
		instantiation.stub(IGitHubService, gitHubService);
		instantiation.stub(ISessionsRecentWorkspacesService, upcastPartial<ISessionsRecentWorkspacesService>({
			getRecentWorkspaces: () => [{ workspace: { uri: workspace, label: 'private', icon: Codicon.repo, requiresWorkspaceTrust: false, folders: [{ root: workspace, workingDirectory: workspace, name: 'private', description: undefined }], isVirtualWorkspace: true }, providerId: 'cloud', checked: true, source: 'agents' }],
		}));
		const provider = disposables.add(instantiation.createInstance(CloudAutomationStore, 'cloud', 'cloud-agent', () => undefined));
		if (clientNotificationOrder === 'after') {
			disposables.add(changed.event(() => clientChanged.fire()));
		}
		const set = async (key: string, value: boolean) => {
			await configuration.setUserConfiguration(key, value);
			configuration.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, affectedKeys: new Set([key]), change: { keys: [key], overrides: [] }, source: ConfigurationTarget.USER });
		};
		return { provider, api, accounts, changed, clientChanged, entitlement, sentimentChanged, set, instantiation, configuration };
	}

	function setupTools() {
		const context = setup();
		const provider = upcastPartial<ISessionsProvider>({ id: 'cloud', label: 'Cloud', automations: context.provider });
		const providers = upcastPartial<ISessionsProvidersService>({
			onDidChangeProviders: Event.None, getProviders: () => [provider],
			getProvider: <T extends ISessionsProvider>() => provider as T,
		});
		const service = disposables.add(new ProviderAutomationService(constObservable(true), providers));
		const sessions = upcastPartial<ISessionsManagementService>({
			getSessionTypesForFolder: () => [{ providerId: 'cloud', sessionType: upcastPartial<ISessionType>({ id: 'cloud-agent' }) }],
		});
		const warnings: string[] = [];
		const notifications = upcastPartial<INotificationService>({ warn: message => warnings.push(String(message)), error: message => assert.fail(String(message)) });
		const runner = new AutomationRunner(service, providers, new NullLogService(), notifications);
		const tools = {
			list: new ListAutomationsTool(service, context.configuration, providers),
			configure: new ConfigureAutomationTool(service, sessions, context.configuration, NullTelemetryService),
			run: new RunAutomationTool(service, runner, context.configuration),
			delete: new DeleteAutomationTool(service, context.configuration),
		};
		const invoke = async (tool: IToolImpl, parameters: object, token = CancellationToken.None) => {
			const result = await tool.invoke({ callId: 'call', toolId: 'tool', parameters, context: undefined }, async () => 0, { report: () => { } }, token);
			const part = result.content[0];
			assert.ok(part.kind === 'text');
			return JSON.parse(part.value);
		};
		return { ...context, service, tools, invoke, warnings };
	}

	test('tools discover the live catalog only behind the cloud gate and expose catalog failures', async () => {
		const { api, set, tools, invoke } = setupTools();
		assert.deepStrictEqual({ providers: await invoke(tools.list, {}), calls: api.calls }, { providers: [], calls: [] });
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		api.toolsError = new Error('Offline');
		const [loading] = await invoke(tools.list, {});
		await timeout(0);
		api.toolsError = undefined;
		const [failed] = await invoke(tools.list, {});
		await timeout(0);
		const [ready] = await invoke(tools.list, {});
		const [cached] = await invoke(tools.list, {});
		assert.deepStrictEqual({
			loading: loading.configuration.tools.kind,
			failed: failed.configuration.tools.kind,
			description: ready.configuration.description,
			tools: ready.configuration.tools.groups.flatMap((group: { tools: { id: string }[] }) => group.tools.map(tool => tool.id)),
			cached: cached.configuration, requests: api.calls.filter(call => call === 'tools').length,
		}, {
			loading: 'loading', failed: 'error', description: 'Runs even when your computer is off, triggered by events or on a schedule.', tools: ['github/issue_read', 'github/list_issues', 'github/unnamed'],
			cached: ready.configuration, requests: 2,
		});
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, false);
		const calls = api.calls.length;
		assert.deepStrictEqual({ providers: await invoke(tools.list, {}), calls: api.calls.length - calls }, { providers: [], calls: 0 });
	});

	test('configure tool uses current cloud defaults, UTC and model/tool partial updates', async () => {
		const { api, set, tools, invoke } = setupTools();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await invoke(tools.list, {});
		await timeout(0);
		const [listed] = await invoke(tools.list, {});
		const created = await invoke(tools.configure, {
			name: 'New', prompt: 'Review',
			target: { kind: 'workspace', folderUri: workspace.toString(), providerId: 'cloud', sessionTypeId: 'cloud-agent' },
			schedule: { interval: 'daily', timeZone: 'UTC', scheduleHour: 12, scheduleMinute: 30 },
			sessionTemplate: { modelId: 'model', config: { tools: [listed.configuration.tools.groups[0].tools[0].id] } },
		});
		api.definitions = [{ ...definition, name: 'New', triggers: { interval: { types: ['daily'], hour_utc: 12, minute_utc: 30 } }, model: 'model', tools: ['github/issue_read'] }];
		await invoke(tools.list, {});
		await invoke(tools.configure, { automationId: created.automation.id, schedule: { interval: 'manual' } });
		assert.deepStrictEqual({ enabled: created.automation.enabled, schedule: created.automation.schedule, template: created.automation.sessionTemplate, patch: api.patch }, {
			enabled: true, schedule: { interval: 'daily', timeZone: 'UTC', scheduleHour: 12, scheduleMinute: 30, scheduleDay: 0 },
			template: { modelId: 'model', config: { tools: ['github/issue_read'] } }, patch: { triggers: {} },
		});
	});

	test('list tool reports refresh failures and does not publish data after gate revocation', async () => {
		const { api, set, tools, invoke } = setupTools();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		api.listError = new Error('Repository offline');
		const [failed] = await invoke(tools.list, {});
		assert.deepStrictEqual({ state: failed.state, reason: typeof failed.unavailableReason, canCreate: failed.canCreateAutomation }, {
			state: 'error', reason: 'string', canCreate: false,
		});
		api.listError = undefined;
		const pending = new DeferredPromise<void>();
		api.pendingList = pending.p;
		const listing = invoke(tools.list, {});
		await timeout(0);
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, false);
		await pending.complete();
		assert.deepStrictEqual(await listing, []);
	});

	test('list cancellation returns before a slow shared refresh without publishing results or loading tools', async () => {
		const { api, provider, set, tools, invoke } = setupTools();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		const pending = new DeferredPromise<void>();
		const cancellation = disposables.add(new CancellationTokenSource());
		api.pendingList = pending.p;
		const listing = invoke(tools.list, {}, cancellation.token);
		await timeout(0);
		assert.ok(api.calls.includes('list'));
		cancellation.cancel();
		try {
			assert.deepStrictEqual({ result: await listing, tools: api.calls.includes('tools') }, { result: { status: 'cancelled' }, tools: false });
		} finally {
			await pending.complete();
		}
		await provider.refresh();
		assert.deepStrictEqual({ result: await listing, tools: api.calls.includes('tools') }, { result: { status: 'cancelled' }, tools: false });
	});

	test('an already cancelled list invocation starts no provider requests', async () => {
		const { api, set, tools, invoke } = setupTools();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		assert.deepStrictEqual({ result: await invoke(tools.list, {}, CancellationToken.Cancelled), calls: api.calls }, { result: { status: 'cancelled' }, calls: [] });
	});

	test('list tool separates history-only failure from ready definitions and exposes cached active runs', async () => {
		const { api, provider, set, tools, invoke } = setupTools();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		api.tasks = [{ id: 'active', state: 'in_progress', created_at: definition.created_at, remote_steerable: true }];
		const [ready] = await invoke(tools.list, {});
		const active = provider.getActiveRunFor(ready.automations[0].id)!;
		api.historyError = new Error('History offline');
		const [failedHistory] = await invoke(tools.list, {});
		assert.deepStrictEqual({
			state: failedHistory.state, history: failedHistory.historyState,
			reason: failedHistory.unavailableReason, canCreate: failedHistory.canCreateAutomation,
			active: failedHistory.automations[0].activeRun, readyHistory: ready.historyState,
		}, {
			state: 'ready', history: 'error', reason: undefined, canCreate: true,
			active: { id: active.id, status: active.status, startedAt: active.startedAt }, readyHistory: 'ready',
		});
		api.historyError = undefined;
		api.tasks = [{ ...api.tasks[0], state: 'completed' }];
		const [completed] = await invoke(tools.list, {});
		assert.deepStrictEqual({ history: completed.historyState, active: completed.automations[0].activeRun }, { history: 'ready', active: undefined });
	});

	test('run tool returns accepted, already-running and uncertain outcomes without fabricated runs', async () => {
		const { api, provider, set, tools, invoke, warnings } = setupTools();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		const [listed] = await invoke(tools.list, {});
		const automation = listed.automations[0];
		const accepted = await invoke(tools.run, { automationId: automation.id });
		api.tasks = [{ id: 'active', state: 'in_progress', created_at: definition.created_at, remote_steerable: true }];
		await provider.refresh();
		const already = await invoke(tools.run, { automationId: automation.id });
		assert.deepStrictEqual({ accepted, activeId: already.run.id, status: already.status, dispatches: api.calls.filter(call => call === 'run').length }, {
			accepted: { status: 'accepted', automation: { id: automation.id, name: automation.name } }, activeId: provider.runs.get()[0].id, status: 'already_running', dispatches: 1,
		});
		api.tasks = [];
		await provider.refresh();
		api.dispatchError = new ApiRequestError(503, 'unknown', { message: 'unknown', documentation_url: 'https://docs.github.com' }, undefined, undefined, 'indeterminate');
		assert.deepStrictEqual(await invoke(tools.run, { automationId: automation.id }), { status: 'unknown', automation: { id: automation.id, name: automation.name }, message: reconciliationMessage });
		assert.deepStrictEqual({ warnings, canRun: provider.canRunAutomation(automation.id) }, { warnings: [reconciliationMessage], canRun: false });
	});

	test('tools block uncertain run retries until listing successfully refreshes history', async () => {
		const { api, provider, set, tools, invoke } = setupTools();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		const [listed] = await invoke(tools.list, {});
		const automation = listed.automations[0];
		api.dispatchError = new MutationUncertainError('network');
		api.historyError = new Error('History offline');
		const uncertain = await invoke(tools.run, { automationId: automation.id });
		api.dispatchError = undefined;
		const [failedHistory] = await invoke(tools.list, {});
		const retry = await invoke(tools.run, { automationId: automation.id });
		assert.deepStrictEqual({
			state: failedHistory.state, history: failedHistory.historyState,
			active: failedHistory.automations[0].activeRun, canRun: provider.canRunAutomation(automation.id),
			operations: failedHistory.automations[0].availableOperations,
			uncertain, retry, dispatches: api.dispatchRequests.length,
		}, {
			state: 'ready', history: 'error', active: undefined, canRun: true,
			operations: ['update', 'delete'],
			uncertain: { status: 'unknown', automation: { id: automation.id, name: automation.name }, message: reconciliationMessage },
			retry: { status: 'unknown', automation: { id: automation.id, name: automation.name }, message: reconciliationMessage },
			dispatches: 1,
		});
		api.historyError = undefined;
		const [reconciled] = await invoke(tools.list, {});
		const requested = await invoke(tools.run, { automationId: automation.id });
		assert.deepStrictEqual({
			history: reconciled.historyState, operations: reconciled.automations[0].availableOperations,
			status: requested.status, dispatches: api.dispatchRequests.length,
		}, { history: 'ready', operations: ['run', 'update', 'delete'], status: 'accepted', dispatches: 2 });
	});

	test('run preflight still rejects remote disablement without dispatching', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const id = provider.automations.get()[0].id;
		api.definitions = [{ ...definition, disabled: true }];
		await assert.rejects(provider.runAutomation(id), /Only enabled cloud automations can run/);
		assert.deepStrictEqual({ requests: api.dispatchRequests, canRun: provider.canRunAutomation(id), canDelete: provider.canDeleteAutomation(id) }, { requests: [], canRun: false, canDelete: true });
	});

	for (const changedDuringPreflight of [false, true]) {
		test(`read-only custom triggers allow manual Run ${changedDuringPreflight ? 'after preflight changes' : 'from the listed definition'}`, async () => {
			const { provider, api, set } = setup();
			const custom = { ...definition, triggers: { webhook: { types: ['issue'] } } };
			if (!changedDuringPreflight) {
				api.definitions = [custom];
			}
			await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
			await provider.refresh();
			const id = provider.automations.get()[0].id;
			api.definitions = [custom];
			const result = await provider.runAutomation(id);
			assert.deepStrictEqual({
				result, requests: api.dispatchRequests, readOnly: !!provider.getAutomation(id)?.readOnlyReason,
				canRun: provider.canRunAutomation(id), canUpdate: provider.canUpdateAutomation(id),
			}, { result: { kind: 'accepted' }, requests: [{ event: 'manual' }], readOnly: false, canRun: true, canUpdate: true });
		});
	}

	test('idle definitions do not poll and postdispatch history discovery is bounded', async () => {
		const clock = useFakeTimers();
		try {
			const { provider, api, set } = setup();
			await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
			await provider.refresh();
			api.calls.length = 0;
			api.historyOptions.length = 0;
			await clock.tickAsync(60_000);
			assert.deepStrictEqual(api.calls, []);
			await provider.runAutomation(provider.automations.get()[0].id);
			await clock.tickAsync(120_000);
			assert.deepStrictEqual({
				calls: api.calls.filter(call => call !== 'capability'),
				priorities: api.historyOptions.map(options => options?.priority),
			}, {
				calls: ['run', 'history', 'history', 'history', 'history', 'history'],
				priorities: Array(5).fill('background'),
			});
		} finally {
			clock.restore();
		}
	});

	test('background refresh preserves an open cloud draft and its unsaved model selection', async () => {
		const { provider, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const session = upcastPartial<ISession>({ sessionId: 'draft' });
		const currentSession = observableValue<ISession | undefined>('draft', undefined);
		let modelId = 'saved-model';
		let created = 0;
		let discarded = 0;
		const errors: unknown[] = [];
		const sessions = upcastPartial<ISessionsManagementService>({
			automationSession: currentSession,
			isNewSessionTargetAvailable: () => true,
			supportsAutomationSessionConfiguration: () => true,
			createAutomationSession: (_workspace, options) => {
				created++;
				modelId = options?.sessionTemplate?.modelId ?? 'saved-model';
				currentSession.set(session, undefined);
				return session;
			},
			getAutomationSessionConfiguration: async () => ({ sessionTemplate: { modelId } }),
			discardAutomationSession: () => { discarded++; currentSession.set(undefined, undefined); },
		});
		const draft = disposables.add(new AutomationSessionDraftSynchronizer(sessions, async () => true, error => errors.push(error)));
		disposables.add(autorun(reader => {
			const target = provider.configuration.getWorkspaceTarget(workspace).read(reader);
			draft.update(target.workspace ? {
				kind: 'workspace', folderUri: target.workspace, providerId: 'cloud', sessionTypeId: 'cloud-agent',
				sessionConfiguration: { sessionTemplate: { modelId: 'saved-model' } },
			} : undefined);
		}));
		await timeout(0);
		await draft.waitForSync();
		modelId = 'unsaved-model';
		await provider.refresh({ background: true });
		await draft.waitForSync();
		const afterBackground = { created, discarded, configuration: await draft.getSessionConfiguration(), errors };
		await provider.refresh();
		await timeout(0);
		await draft.waitForSync();
		assert.deepStrictEqual({ afterBackground, manualRefreshRecheckedTarget: discarded > 0 }, {
			afterBackground: { created: 1, discarded: 0, configuration: { kind: 'captured', configuration: { sessionTemplate: { modelId: 'unsaved-model' } } }, errors: [] },
			manualRefreshRecheckedTarget: true,
		});
	});

	test('cached definitions stay editable during refresh and refresh progress includes history', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const automation = provider.automations.get()[0];
		const list = new DeferredPromise<void>();
		const history = new DeferredPromise<void>();
		api.pendingList = list.p;
		api.pendingHistory = history.p;
		const refreshingStates: boolean[] = [];
		disposables.add(autorun(reader => refreshingStates.push(provider.isRefreshing.read(reader))));
		const first = provider.refresh();
		const second = provider.refresh();
		await timeout(0);
		const definitions = {
			refreshing: provider.isRefreshing.get(),
			catalogue: provider.catalogueState.get(),
			editable: provider.canUpdateAutomation(automation.id),
		};
		await list.complete();
		await timeout(0);
		const loadingHistory = { refreshing: provider.isRefreshing.get(), history: provider.historyState.get() };
		await history.complete();
		await Promise.all([first, second]);
		assert.deepStrictEqual({ definitions, loadingHistory, refreshing: provider.isRefreshing.get(), refreshingStates }, {
			definitions: { refreshing: true, catalogue: 'ready', editable: true },
			loadingHistory: { refreshing: true, history: 'loading' },
			refreshing: false,
			refreshingStates: [false, true, false],
		});
	});

	test('failed refresh clears progress and preserves the error gate until successful reconciliation', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const automation = provider.automations.get()[0];
		api.listError = new Error('Offline');
		await assert.rejects(provider.refresh());
		const failed = { refreshing: provider.isRefreshing.get(), state: provider.catalogueState.get(), editable: provider.canUpdateAutomation(automation.id) };
		api.listError = undefined;
		const pending = new DeferredPromise<void>();
		api.pendingList = pending.p;
		const refresh = provider.refresh();
		const retrying = { refreshing: provider.isRefreshing.get(), editable: provider.canUpdateAutomation(automation.id) };
		await pending.complete();
		await refresh;
		assert.deepStrictEqual({ failed, retrying, ready: provider.canUpdateAutomation(automation.id) }, {
			failed: { refreshing: false, state: 'error', editable: false },
			retrying: { refreshing: true, editable: false },
			ready: true,
		});
	});

	test('explicit refresh reloads definitions after an in-flight history-only poll', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const pending = new DeferredPromise<void>();
		api.pendingHistory = pending.p;
		await provider.runAutomation(provider.automations.get()[0].id);
		await timeout(0);
		const polling = { fullRefresh: provider.isRefreshing.get(), history: provider.historyState.get() };
		api.calls.length = 0;
		api.definitions = [{ ...definition, name: 'Updated on GitHub' }];
		const refresh = provider.refresh();
		const fullRefreshStarted = provider.isRefreshing.get();
		await pending.complete();
		await refresh;
		assert.deepStrictEqual({
			polling, fullRefreshStarted,
			fullRefresh: provider.isRefreshing.get(),
			catalogueReads: api.calls.filter(call => call === 'list').length,
			name: provider.automations.get()[0].name,
		}, {
			polling: { fullRefresh: false, history: 'loading' },
			fullRefreshStarted: true,
			fullRefresh: false,
			catalogueReads: 1,
			name: 'Updated on GitHub',
		});
	});

	test('concurrent refreshes share history and cannot republish rows after the cloud gate closes', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const pending = new DeferredPromise<void>();
		api.pendingHistory = pending.p;
		api.tasks = [{ id: 'late', state: 'completed', created_at: definition.created_at, remote_steerable: true }];
		api.calls.length = 0;
		const first = provider.refresh();
		const second = provider.refresh();
		await timeout(0);
		const loading = { state: provider.historyState.get(), reads: api.calls.filter(call => call === 'history').length };
		const rejected = Promise.all([assert.rejects(first, isCancellationError), assert.rejects(second, isCancellationError)]);
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, false);
		await pending.complete();
		await rejected;
		assert.deepStrictEqual({
			loading, history: provider.historyState.get(), definitions: provider.automations.get(), runs: provider.runs.get(),
		}, { loading: { state: 'loading', reads: 1 }, history: 'ready', definitions: [], runs: [] });
	});

	test('history poll failures stop automatic retries and manual refresh restores polling', async () => {
		const clock = useFakeTimers();
		try {
			const { provider, api, set } = setup();
			api.tasks = [{ id: 'task', state: 'in_progress', created_at: definition.created_at, remote_steerable: true }];
			await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
			await provider.refresh();
			const runId = provider.runs.get()[0].id;
			api.calls.length = 0;
			api.historyError = new Error('Offline');
			await clock.tickAsync(15_000);
			const failed = { history: provider.historyState.get(), catalogue: provider.catalogueState.get(), runId: provider.runs.get()[0].id };
			await clock.tickAsync(300_000);
			const failedReads = api.calls.filter(call => call === 'history').length;
			api.historyError = undefined;
			await provider.refresh();
			api.calls.length = 0;
			await clock.tickAsync(15_000);
			assert.deepStrictEqual({ failed, failedReads, recovered: provider.historyState.get(), calls: api.calls }, {
				failed: { history: 'error', catalogue: 'ready', runId }, failedReads: 1, recovered: 'ready', calls: ['history'],
			});
			provider.dispose();
			api.calls.length = 0;
			await clock.tickAsync(60_000);
			assert.deepStrictEqual(api.calls, []);
		} finally {
			clock.restore();
		}
	});

	test('active history refreshes at 15 seconds and stops on completion and client invalidation', async () => {
		const clock = useFakeTimers();
		try {
			const { provider, api, set, clientChanged } = setup();
			api.tasks = [{ id: 'task', state: 'in_progress', created_at: definition.created_at, remote_steerable: true }];
			await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
			await provider.refresh();
			api.calls.length = 0;
			await clock.tickAsync(14_999);
			assert.deepStrictEqual(api.calls, []);
			await clock.tickAsync(1);
			assert.deepStrictEqual(api.calls, ['history']);
			api.tasks = [{ ...api.tasks[0], state: 'completed' }];
			await clock.tickAsync(60_000);
			assert.deepStrictEqual(api.calls, ['history', 'history']);
			api.tasks = [{ ...api.tasks[0], state: 'in_progress' }];
			await provider.refresh();
			api.tasks = [];
			clientChanged.fire();
			await clock.tickAsync(0);
			api.calls.length = 0;
			await clock.tickAsync(60_000);
			assert.deepStrictEqual({ calls: api.calls, runs: provider.runs.get() }, { calls: [], runs: [] });
			await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, false);
		} finally {
			clock.restore();
		}
	});

	test('history failures retain rows without poisoning definition readiness or acknowledgements', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		api.historyError = new Error('History offline');
		const accepted = await provider.runAutomation(provider.automations.get()[0].id);
		api.historyError = undefined;
		api.tasks = [{ id: 'task', state: 'in_progress', created_at: definition.created_at, remote_steerable: true }];
		await provider.refresh();
		const run = provider.runs.get()[0];
		api.historyError = new Error('History offline');
		await provider.stopRun(run);
		await assert.rejects(provider.refresh(), /History offline/);
		assert.deepStrictEqual({
			accepted, stopped: api.calls.includes('stop'), catalogue: provider.catalogueState.get(),
			history: provider.historyState.get(), canCreate: provider.canCreateAutomation.get(), run: provider.runs.get()[0],
		}, { accepted: { kind: 'accepted' }, stopped: true, catalogue: 'ready', history: 'error', canCreate: true, run });
		api.historyError = undefined;
		await provider.refresh();
		assert.strictEqual(provider.historyState.get(), 'ready');
	});

	for (const error of [new MutationUncertainError('network'), new ApiRequestError(503, 'unknown', undefined, undefined, undefined, 'indeterminate')]) {
		for (const operation of ['create', 'update', 'delete'] as const) {
			test(`${operation} translates ${error.name} into the shared uncertain error`, async () => {
				const { provider, api, set } = setup();
				await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
				await provider.refresh();
				const automation = provider.automations.get()[0];
				api.createError = api.updateError = api.deleteError = error;
				const result = operation === 'create'
					? provider.createAutomation({ name: 'New', prompt: 'Review', schedule: manual, target: automation.target })
					: operation === 'update'
						? provider.updateAutomationIfUnchanged(automation.id, { name: 'Changed' }, automation)
						: provider.deleteAutomation(automation.id);
				await assert.rejects(result, candidate => candidate instanceof AutomationMutationUncertainError && candidate.cause === error && candidate.message === reconciliationMessage);
				assert.strictEqual(provider.canCreateAutomation.get(), false);
			});
		}

		test(`uncertain ${error.name} dispatch discovers history without clearing mutation uncertainty`, async () => {
			const clock = useFakeTimers();
			try {
				const { provider, api, set } = setup();
				await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
				await provider.refresh();
				api.calls.length = 0;
				api.dispatchError = error;
				await assert.rejects(provider.runAutomation(provider.automations.get()[0].id), candidate => candidate instanceof AutomationMutationUncertainError && candidate.cause === error && candidate.message === reconciliationMessage);
				await clock.tickAsync(120_000);
				assert.deepStrictEqual({
					historyReads: api.calls.filter(call => call === 'history').length,
					canCreate: provider.canCreateAutomation.get(),
				}, { historyReads: 5, canCreate: false });
			} finally {
				clock.restore();
			}
		});
	}

	test('definite API errors expose their server reason through the shared unavailable error', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const reason = 'Repository automations are not enabled for this repository.';
		const error = new ApiRequestError(403, 'authorization', { message: reason, documentation_url: 'https://docs.github.com' });
		api.createError = error;
		const automation = provider.automations.get()[0];
		await assert.rejects(
			provider.createAutomation({ name: 'New', prompt: 'Review', schedule: manual, target: automation.target, ownership: 'repository' }),
			candidate => candidate instanceof AutomationUnavailableError && candidate.message === reason && candidate.cause === error,
		);
	});

	test('loads the tool catalog once from Mission Control, maps server labels, and retries after failure', async () => {
		const { provider, api, set } = setup();
		const read = () => provider.configuration.tools.get();
		const unavailable = read();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		api.toolsError = new Error('Offline');
		provider.configuration.loadTools();
		const loading = read();
		await timeout(0);
		const failed = read();
		api.toolsError = undefined;
		provider.configuration.loadTools();
		await timeout(0);
		provider.configuration.loadTools();
		await timeout(0);
		assert.deepStrictEqual({ unavailable, loading, failed, ready: read(), requests: api.calls.filter(call => call === 'tools').length }, {
			unavailable: { kind: 'error', message: 'Cloud automations are unavailable.' },
			loading: { kind: 'loading' },
			failed: { kind: 'error', message: 'Available tools could not be loaded.' },
			ready: {
				kind: 'ready', groups: [
					{ id: 'issues', label: 'Issues', tools: [{ id: 'github/issue_read', label: 'Read issue', description: 'Read an issue.' }, { id: 'github/list_issues', label: 'List issues', description: undefined }] },
					{ id: 'untitled', label: 'untitled', tools: [{ id: 'github/unnamed', label: 'github/unnamed', description: undefined }] },
				],
			},
			requests: 2,
		});
	});

	test('discards the tool catalog when the account changes', async () => {
		const { provider, api, accounts, changed, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		provider.configuration.loadTools();
		await timeout(0);
		const loaded = provider.configuration.tools.get().kind;
		accounts.currentDefaultAccount = { ...account, sessionId: 'two' };
		changed.fire(accounts.currentDefaultAccount);
		const afterChange = provider.configuration.tools.get().kind;
		provider.configuration.loadTools();
		await timeout(0);
		assert.deepStrictEqual({ loaded, afterChange, reloaded: provider.configuration.tools.get().kind, requests: api.calls.filter(call => call === 'tools').length }, {
			loaded: 'ready', afterChange: 'loading', reloaded: 'ready', requests: 2,
		});
	});

	test('repository search offers only manageable repositories and accepts GitHub URLs', async () => {
		const queries: string[] = [];
		let authenticated = false;
		const { provider, api, set, instantiation } = setup(undefined, undefined, upcastPartial<IGitHubService>({
			authenticateForRepositoryAccess: async () => { authenticated = true; },
			getRepositories: async query => {
				queries.push(query);
				return [
					{ owner: 'owner', name: 'public', fullName: 'owner/public', defaultBranch: 'main', isPrivate: false, description: '' },
					{ owner: 'owner', name: 'private', fullName: 'owner/private', defaultBranch: 'main', isPrivate: true, description: '' },
				];
			},
		}));
		api.repositoryManageability.set('private', false);
		let placeholder: string | undefined;
		const repositories: Array<readonly string[]> = [];
		instantiation.stubInstance(RepositoryPicker, {
			pickRepository: async (search, options) => {
				placeholder = options?.placeholder;
				repositories.push(await search('', CancellationToken.None));
				repositories.push(await search('https://github.com/owner/private.git', CancellationToken.None));
				return { cloneUrl: 'https://github.com/owner/public.git' };
			},
			dispose: () => { },
		});
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		api.configurationRepositories.length = 0;
		const selected = await provider.configuration.pickWorkspace(CancellationToken.None);
		await provider.refresh({ background: true });
		assert.deepStrictEqual({ authenticated, queries, placeholder, repositories, selected: selected?.toString(), configurationRepositories: api.configurationRepositories }, {
			authenticated: true, queries: ['', 'owner/private'],
			placeholder: 'Search for a repository or paste a repository URL...',
			repositories: [['owner/public'], ['owner/public']], selected: URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/owner/public/HEAD' }).toString(),
			configurationRepositories: ['public', 'private'],
		});
	});

	test('repository search submits capability checks in bounded batches and preserves result order', async () => {
		const pending = new DeferredPromise<boolean>();
		const repositories = Array.from({ length: 100 }, (_, index) => ({
			owner: 'owner', name: `repo-${index}`, fullName: `owner/repo-${index}`, defaultBranch: 'main', isPrivate: index % 2 === 0, description: '',
		}));
		const { provider, api, set, instantiation } = setup(undefined, undefined, upcastPartial<IGitHubService>({
			authenticateForRepositoryAccess: async () => { },
			getRepositories: async () => repositories,
		}));
		const searchStarted = new DeferredPromise<void>();
		const searchResult = new DeferredPromise<readonly string[]>();
		instantiation.stubInstance(RepositoryPicker, {
			pickRepository: async search => {
				void searchStarted.complete();
				void searchResult.complete(await search('', CancellationToken.None));
				return undefined;
			},
			dispose: () => { },
		});
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		api.configurationRepositories.length = 0;
		api.maxActiveConfigurations = 0;
		api.pendingManageability = pending.p;
		const selection = provider.configuration.pickWorkspace(CancellationToken.None);
		await searchStarted.p;
		await timeout(0);
		const startedBeforeRelease = api.configurationRepositories.length;
		await pending.complete(true);
		assert.deepStrictEqual({
			startedBeforeRelease,
			maxActiveConfigurations: api.maxActiveConfigurations,
			result: await searchResult.p,
		}, {
			startedBeforeRelease: 5,
			maxActiveConfigurations: 5,
			result: repositories.map(repository => repository.fullName),
		});
		await selection;
	});

	test('repository selection fails closed if cloud is disabled while the picker is open', async () => {
		const { provider, set, instantiation } = setup(undefined, undefined, upcastPartial<IGitHubService>({ authenticateForRepositoryAccess: async () => { } }));
		const selection = new DeferredPromise<IRepositoryPickResult | undefined>();
		const opened = new DeferredPromise<void>();
		instantiation.stubInstance(RepositoryPicker, {
			pickRepository: async () => { void opened.complete(); return selection.p; },
			dispose: () => { },
		});
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		const pending = provider.configuration.pickWorkspace(CancellationToken.None);
		await opened.p;
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, false);
		void selection.complete({ repository: 'owner/private' });
		await assert.rejects(pending);
	});

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

	test('read refresh waits for a late initial account without a change event', async () => {
		const initialAccount = new DeferredPromise<IDefaultAccount | null>();
		const { provider, api, set } = setup(new NullLogService(), undefined, undefined, initialAccount);
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		const refresh = provider.refresh();
		const initializing = { state: provider.catalogueState.get(), writable: provider.canCreateAutomation.get(), calls: [...api.calls] };
		await initialAccount.complete(account);
		await refresh;
		assert.deepStrictEqual({
			initializing,
			state: provider.catalogueState.get(),
			names: provider.automations.get().map(automation => automation.name),
		}, { initializing: { state: 'loading', writable: false, calls: [] }, state: 'ready', names: ['Review'] });
	});

	test('a history-only failure after account initialization leaves the catalogue ready', async () => {
		const initialAccount = new DeferredPromise<IDefaultAccount | null>();
		const { provider, api, set } = setup(new NullLogService(), undefined, undefined, initialAccount);
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		api.historyError = new Error('History unavailable');
		const refresh = provider.refresh();
		await initialAccount.complete(account);
		await assert.rejects(refresh, /History unavailable/);
		assert.deepStrictEqual({
			catalogue: provider.catalogueState.get(), history: provider.historyState.get(),
			writable: provider.canCreateAutomation.get(), names: provider.automations.get().map(automation => automation.name),
		}, { catalogue: 'ready', history: 'error', writable: true, names: ['Review'] });
	});

	for (const resolvedAccount of [null, { ...account, enterprise: true }]) {
		test(`read refresh still rejects an initialized ${resolvedAccount ? 'enterprise' : 'signed-out'} account`, async () => {
			const initialAccount = new DeferredPromise<IDefaultAccount | null>();
			const { provider, api, set } = setup(new NullLogService(), undefined, undefined, initialAccount);
			await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
			const refresh = provider.refresh();
			await initialAccount.complete(resolvedAccount);
			await assert.rejects(refresh, /Sign in to GitHub.com and enable cloud automations/);
			assert.deepStrictEqual({ state: provider.catalogueState.get(), calls: api.calls }, { state: 'unavailable', calls: [] });
		});
	}

	test('read refresh retries successfully after a catalogue error', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		api.listError = new Error('Definitions unavailable');
		await assert.rejects(provider.refresh(), /Some GitHub repositories could not be refreshed/);
		const failed = { state: provider.catalogueState.get(), writable: provider.canCreateAutomation.get() };
		api.listError = undefined;
		api.definitions = [{ ...definition, name: 'Recovered' }];
		await provider.refresh();
		assert.deepStrictEqual({
			failed, state: provider.catalogueState.get(), writable: provider.canCreateAutomation.get(),
			names: provider.automations.get().map(automation => automation.name),
		}, { failed: { state: 'error', writable: false }, state: 'ready', writable: true, names: ['Recovered'] });
	});

	test('enablement discovers and projects definitions; hiding AI clears catalogue and cancels work', async () => {
		const { provider, api, set, entitlement, sentimentChanged } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const automation = provider.automations.get()[0];
		assert.deepStrictEqual({ name: automation.name, target: automation.target.providerId, zone: automation.schedule.timeZone, writable: provider.canCreateAutomation.get() },
			{ name: 'Review', target: 'cloud', zone: 'UTC', writable: true });
		const pending = new DeferredPromise<boolean>();
		api.pendingManageability = pending.p;
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
		let hideAfterRefresh = false;
		disposables.add(autorun(reader => {
			if (provider.automations.read(reader).length > 0 && hideAfterRefresh) {
				hideAfterRefresh = false;
				entitlement.sentiment = { hidden: true };
				sentimentChanged.fire();
			}
		}));
		hideAfterRefresh = true;
		await assert.rejects(provider.refresh(), isCancellationError);
		assert.deepStrictEqual({
			enabled: provider.enabled.get(),
			automations: provider.automations.get(),
			historyRequested: api.calls.includes('history'),
		}, { enabled: false, automations: [], historyRequested: false });
	});

	test('cloud definitions link to their GitHub automation detail page', async () => {
		const { provider, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		assert.strictEqual(provider.automations.get()[0].externalResource?.toString(), 'https://github.com/owner/private/agents/automations/one');
	});

	test('202 remains acknowledgement only and task history projects exact native resources', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const automation = provider.automations.get()[0];
		api.tasks = [{ id: 'task', state: 'waiting_for_user', created_at: definition.created_at, remote_steerable: true }];
		assert.deepStrictEqual(await provider.runAutomation(automation.id), { kind: 'accepted' });
		await provider.refresh();
		const run = provider.runs.get()[0];
		assert.deepStrictEqual({ status: run.status, trigger: run.trigger, needsInput: run.needsInput, session: run.sessionResource?.toString(), url: run.externalResource?.toString() },
			{ status: 'running', trigger: 'external', needsInput: true, session: 'copilot-cloud-agent:/task/task', url: 'https://github.com/owner/private/tasks/task' });
	});

	test('local follow-ups restart bounded discovery even when the task is not yet in history', async () => {
		const clock = useFakeTimers();
		try {
			const { provider, api, set } = setup();
			api.tasks = [{ id: 'exact', state: 'completed', created_at: definition.created_at, remote_steerable: true }];
			await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
			await provider.refresh();
			assert.strictEqual(provider.runs.get()[0].sessionResource?.toString(), 'copilot-cloud-agent:/task/exact');
			api.calls.length = 0;
			provider.observeLocalRequest(URI.parse('copilot-cloud-agent:/task/unlisted'));
			await clock.tickAsync(120_000);
			const requests = api.calls.slice();
			await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, false);
			provider.observeLocalRequest(URI.parse('copilot-cloud-agent:/task/exact'));
			await clock.tickAsync(120_000);
			assert.deepStrictEqual({ requests, afterDisabled: api.calls }, { requests: Array(5).fill('history'), afterDisabled: Array(5).fill('history') });
		} finally {
			clock.restore();
		}
	});

	for (const order of ['before', 'after'] as const) {
		test(`account changes reload after client notifications ${order} the adapter`, async () => {
			const { provider, api, accounts, changed, set } = setup(new NullLogService(), order);
			await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
			await provider.refresh();
			api.calls.length = 0;
			api.definitions = [{ ...definition, name: 'New account' }];
			const pending = new DeferredPromise<void>();
			api.pendingList = pending.p;
			accounts.currentDefaultAccount = { ...account, sessionId: 'replacement' };
			changed.fire(accounts.currentDefaultAccount);
			assert.strictEqual(provider.canCreateAutomation.get(), false);
			await timeout(0);
			assert.deepStrictEqual(api.calls, ['capability', 'list']);
			await pending.complete();
			await timeout(0);
			assert.deepStrictEqual({
				names: provider.automations.get().map(automation => automation.name),
				writable: provider.canCreateAutomation.get(),
			}, { names: ['New account'], writable: true });
		});
	}

	test('grant-only changes reload and block uncertain-create retries until successful reconciliation', async () => {
		const { provider, api, clientChanged, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const options = { name: 'Create', prompt: 'Review', schedule: manual, target: provider.automations.get()[0].target };
		api.createError = new MutationUncertainError('unknown');
		await assert.rejects(provider.createAutomation(options), AutomationMutationUncertainError);
		const pending = new DeferredPromise<void>();
		api.pendingList = pending.p;
		api.listError = new Error('Offline');
		clientChanged.fire();
		assert.strictEqual(provider.canCreateAutomation.get(), false);
		await assert.rejects(provider.createAutomation(options), /Refresh cloud automations/);
		await pending.complete();
		await timeout(0);
		assert.deepStrictEqual({ state: provider.catalogueState.get(), writable: provider.canCreateAutomation.get() },
			{ state: 'error', writable: false });
		api.listError = undefined;
		api.createError = undefined;
		api.definitions = [{ ...definition, name: 'Reconciled' }];
		clientChanged.fire();
		await timeout(0);
		assert.deepStrictEqual({
			names: provider.automations.get().map(automation => automation.name),
			writable: provider.canCreateAutomation.get(),
			creates: api.calls.filter(call => call === 'create').length,
		}, { names: ['Reconciled'], writable: true, creates: 1 });
	});

	test('missing preflight definitions clear cached cards and history and report a deleted conflict', async () => {
		const { provider, api, set } = setup();
		api.tasks = [{ id: 'task', state: 'completed', created_at: definition.created_at, remote_steerable: false }];
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const expected = provider.automations.get()[0];
		api.getError = new ApiRequestError(404, 'unknown');
		const result = await provider.updateAutomationIfUnchanged(expected.id, { name: 'New' }, expected);
		assert.deepStrictEqual({ result, automations: provider.automations.get(), runs: provider.runs.get(), sent: api.calls.includes('update') }, {
			result: { kind: 'conflict', current: undefined }, automations: [], runs: [], sent: false,
		});
	});

	test('other preflight errors retain the cached definition and reach the caller', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const expected = provider.automations.get()[0];
		api.getError = new ApiRequestError(503, 'unknown');
		await assert.rejects(provider.updateAutomationIfUnchanged(expected.id, { name: 'New' }, expected), error => error === api.getError);
		assert.deepStrictEqual(provider.automations.get(), [expected]);
	});

	test('ordinary updates report unavailable after a missing preflight definition', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const expected = provider.automations.get()[0];
		api.getError = new ApiRequestError(404, 'unknown');
		await assert.rejects(provider.updateAutomation(expected.id, { name: 'New' }), /no longer available/);
		assert.deepStrictEqual({ automations: provider.automations.get(), sent: api.calls.includes('update') }, { automations: [], sent: false });
	});

	test('run preflight removes a remotely deleted definition and its history before reporting unavailable', async () => {
		const { provider, api, set } = setup();
		api.tasks = [{ id: 'task', state: 'completed', created_at: definition.created_at, remote_steerable: false }];
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const automation = provider.automations.get()[0];
		assert.strictEqual(provider.runs.get().length, 1);
		api.getError = new ApiRequestError(404, 'notFound');
		await assert.rejects(provider.runAutomation(automation.id), error => error instanceof AutomationUnavailableError && /no longer available/.test(error.message));
		assert.deepStrictEqual({ automations: provider.automations.get(), runs: provider.runs.get(), dispatches: api.dispatchRequests }, { automations: [], runs: [], dispatches: [] });
	});

	test('run preflight retains cached definitions on non-404 failures', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const automation = provider.automations.get()[0];
		api.getError = new ApiRequestError(503, 'unknown');
		await assert.rejects(provider.runAutomation(automation.id), error => error === api.getError);
		assert.deepStrictEqual({ automations: provider.automations.get(), dispatches: api.dispatchRequests }, { automations: [automation], dispatches: [] });
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

	test('cancelled runs project as completed while real failures keep their error', async () => {
		const { provider, api, set } = setup();
		api.tasks = (['cancelled', 'failed', 'timed_out'] as const).map(state => ({ id: state, state, created_at: definition.created_at, updated_at: '2026-01-02T00:00:00Z', remote_steerable: false }));
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		assert.deepStrictEqual(provider.runs.get().map(run => ({ status: run.status, completedAt: run.completedAt, errorMessage: run.errorMessage, statusDescription: run.statusDescription })), [
			{ status: 'completed', completedAt: '2026-01-02T00:00:00Z', errorMessage: undefined, statusDescription: 'Cancelled' },
			{ status: 'failed', completedAt: '2026-01-02T00:00:00Z', errorMessage: 'failed', statusDescription: undefined },
			{ status: 'failed', completedAt: '2026-01-02T00:00:00Z', errorMessage: 'timed_out', statusDescription: undefined },
		]);
	});

	test('trigger catalog loads on demand, caches successes, retries failures and resets with the account', async () => {
		const { provider, api, set, accounts, changed } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		assert.strictEqual(api.calls.includes('triggers'), false);
		api.triggersError = new Error('offline');
		provider.configuration.loadTriggers!();
		await timeout(0);
		const failed = provider.configuration.triggers!.get().kind;
		api.triggersError = undefined;
		provider.configuration.loadTriggers!();
		await timeout(0);
		provider.configuration.loadTriggers!();
		const loaded = provider.configuration.triggers!.get();
		accounts.currentDefaultAccount = { ...account, accountName: 'other', sessionId: 'other' };
		changed.fire(accounts.currentDefaultAccount);
		assert.deepStrictEqual({
			failed, loaded, requests: api.calls.filter(call => call === 'triggers').length,
			reset: provider.configuration.triggers!.get(),
		}, { failed: 'error', loaded: { kind: 'ready', definitions: api.triggerDefinitions }, requests: 2, reset: { kind: 'loading' } });
	});

	test('trigger mutations distinguish transient catalog state from unsupported configurations', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const automation = provider.automations.get()[0];
		const cloudTrigger = { triggers: { issues: { types: ['opened'] } } };
		const create = () => provider.createAutomation({
			name: 'Issue', prompt: 'Triage', schedule: manual, cloudTrigger,
			target: automation.target,
		});
		const update = () => provider.updateAutomation(automation.id, { cloudTrigger });

		await assert.rejects(create(), /Available triggers are still loading/);
		await assert.rejects(update(), /Available triggers are still loading/);
		const callsWhileLoading = api.calls.filter(call => call === 'triggers').length;

		api.triggersError = new Error('offline');
		provider.configuration.loadTriggers!();
		await timeout(0);
		await assert.rejects(create(), /Available triggers could not be loaded.*Retry loading the trigger catalog/);
		await assert.rejects(update(), /Available triggers could not be loaded.*Retry loading the trigger catalog/);

		api.triggersError = undefined;
		provider.configuration.loadTriggers!();
		await timeout(0);
		await update();
		const updated = api.patch;
		await create();
		const created = api.created;

		const unsupported = { triggers: { issues: { types: ['opened'] }, pull_request_opened: { types: ['opened'] } } };
		await assert.rejects(provider.updateAutomation(automation.id, { cloudTrigger: unsupported }), /cannot be edited in VS Code/);
		assert.deepStrictEqual({
			callsWhileLoading,
			triggerRequests: api.calls.filter(call => call === 'triggers').length,
			updated,
			created: created?.triggers,
		}, {
			callsWhileLoading: 0,
			triggerRequests: 2,
			updated: { triggers: cloudTrigger.triggers },
			created: cloudTrigger.triggers,
		});
	});

	test('Issue creation and explicit edits round trip without granting tool permissions', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		provider.configuration.loadTriggers!();
		await timeout(0);
		const trigger = { triggers: { issues: { types: ['opened'], write_scope: 'repository' as const, allow_copilot_triggers: true, future: { keep: 1 } } }, requireActorWritePermission: true };
		const created = await provider.createAutomation({
			name: 'Issue', prompt: 'Triage', schedule: manual, cloudTrigger: trigger, sessionTemplate: { config: { tools: [] } },
			target: { kind: 'workspace', folderUri: workspace, providerId: 'cloud', sessionTypeId: 'cloud-agent', isolation: { kind: 'default' } },
		});
		api.definitions = [{ ...definition, triggers: trigger.triggers, require_actor_write_permission: true }];
		await provider.refresh();
		const automation = provider.automations.get()[0];
		await provider.updateAutomation(automation.id, { cloudTrigger: { ...trigger, requireActorWritePermission: false } });
		const actorPatch = api.patch;
		await provider.updateAutomation(automation.id, { name: 'Rename' });
		assert.deepStrictEqual({
			created: created.cloudTrigger, tools: api.created?.tools, permissions: Object.hasOwn(api.created!, 'permissions'), toolsets: api.created?.github_mcp_toolsets,
			actorPatch, rename: api.patch, canRun: provider.canRunAutomation(automation.id),
		}, { created: trigger, tools: [], permissions: false, toolsets: undefined, actorPatch: { require_actor_write_permission: false }, rename: { name: 'Rename' }, canRun: false });
	});

	test('PR filters round trip through create and edit while retaining unedited event entries', async () => {
		const { provider, api, set } = setup();
		api.triggerDefinitions = [
			{ name: 'pull_request_opened', title: 'Opened', description: '', fields: [{ name: 'types', required: true, options: ['opened'] }, { name: 'paths', required: false }] },
			{ name: 'pull_request_comment', title: 'Comment', description: '', fields: [{ name: 'types', required: true, options: ['timeline_comment', 'review_comment'] }, { name: 'body_substring', required: false }] },
		];
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		provider.configuration.loadTriggers!();
		await timeout(0);
		const triggers = {
			pull_request_opened: { types: ['opened'], paths: ['src/**', '!generated/**'], opaque: { keep: true } },
			pull_request_comment: { types: ['timeline_comment', 'review_comment'], body_substring: '/review', write_scope: 'trigger' as const, allow_copilot_triggers: true },
		};
		const created = await provider.createAutomation({
			name: 'Review', prompt: 'Review PR', schedule: manual, cloudTrigger: { triggers },
			target: { kind: 'workspace', folderUri: workspace, providerId: 'cloud', sessionTypeId: 'cloud-agent', isolation: { kind: 'default' } },
		});
		api.definitions = [{ ...definition, ...api.created }];
		await provider.refresh();
		const changed = { ...triggers, pull_request_comment: { ...triggers.pull_request_comment, body_substring: '/check' } };
		const edited = await provider.updateAutomation(created.id, { cloudTrigger: { triggers: changed } });
		assert.deepStrictEqual({
			created: created.cloudTrigger, patch: api.patch, edited: edited.cloudTrigger,
		}, {
			created: { triggers, requireActorWritePermission: false },
			patch: { triggers: changed }, edited: { triggers: changed, requireActorWritePermission: false },
		});
	});

	test('tools describe event triggers and preserve them on unrelated edits without authoring events', async () => {
		const { api, set, tools, invoke } = setupTools();
		api.definitions = [{ ...definition, triggers: { pull_request_comment: { types: ['review_comment'], body_substring: '/review', opaque: true } } }];
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		const [listed] = await invoke(tools.list, {});
		const automation = listed.automations[0];
		await invoke(tools.configure, { automationId: automation.id, prompt: 'New prompt' });
		const patch = api.patch;
		const rejected = await tools.configure.invoke({ callId: 'call', toolId: 'tool', parameters: { automationId: automation.id, schedule: { interval: 'manual' } }, context: undefined }, async () => 0, { report: () => { } }, CancellationToken.None);
		assert.deepStrictEqual({ trigger: automation.cloudTrigger, patch, canRun: automation.availableOperations.includes('run'), rejected: rejected.content }, {
			trigger: { triggers: api.definitions[0].triggers }, patch: { prompt: 'New prompt' }, canRun: false,
			rejected: [{ kind: 'text', value: 'Edit event triggers in the automation dialog or on GitHub. Omit schedule when editing other fields.' }],
		});
	});

	test('unrelated patches omit unsupported triggers and opaque settings', async () => {
		const { provider, api, set } = setup();
		const triggers = { issues: { types: ['opened'], write_scope: 'repository' as const, allow_copilot_triggers: true, future: { opaque: [1, false] } }, future_event: { types: ['future'] } };
		api.definitions = [{ ...definition, triggers, require_actor_write_permission: true }];
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		provider.configuration.loadTriggers!();
		await timeout(0);
		const automation = provider.automations.get()[0];
		const canRun = provider.canRunAutomation(automation.id);
		const updated = await provider.updateAutomation(automation.id, { name: 'New', prompt: 'New prompt', enabled: false, sessionTemplate: { modelId: 'model', config: { tools: [] } } });
		assert.deepStrictEqual({
			canRun, patch: api.patch, trigger: updated.cloudTrigger,
		}, {
			canRun: false, patch: { name: 'New', prompt: 'New prompt', disabled: true, model: 'model', tools: [] },
			trigger: { triggers, requireActorWritePermission: true },
		});
		await assert.rejects(provider.updateAutomation(automation.id, { schedule: manual }), /cannot be edited/);
	});

	test('guarded edits detect trigger-only and actor-permission changes', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const expected = provider.automations.get()[0];
		api.definitions = [{ ...definition, require_actor_write_permission: true }];
		const actor = await provider.updateAutomationIfUnchanged(expected.id, { name: 'New' }, expected);
		api.definitions = [{ ...definition, triggers: { issues: { types: ['opened'], future: { opaque: true } } } }];
		const trigger = await provider.updateAutomationIfUnchanged(expected.id, { name: 'New' }, expected);
		assert.deepStrictEqual({ actor: actor.kind, trigger: trigger.kind, patch: api.patch }, { actor: 'conflict', trigger: 'conflict', patch: undefined });
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
		const created = await provider.createAutomation({ ...options, schedule: { ...manual, interval: 'hourly' } });
		assert.strictEqual(created.enabled, true);
		const disabled = await provider.createAutomation({ ...options, enabled: false });
		assert.strictEqual(disabled.enabled, false);
	});

	test('ownership defaults to Only me, accepts both response fields and is sent only on Repository create', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const legacy = provider.automations.get()[0];
		const options = { name: 'Review', prompt: 'Review issues', schedule: manual, target: legacy.target };
		await provider.createAutomation(options);
		const personal = api.created;
		await provider.createAutomation({ ...options, ownership: 'repository' });
		const shared = api.created;
		api.definitions = [{ ...definition, owner_type: 'repository' }];
		await provider.refresh();
		const repository = provider.automations.get()[0];
		await provider.updateAutomation(repository.id, { name: 'Renamed' });
		assert.deepStrictEqual({
			legacy: legacy.ownership, alias: repository.ownership, personal, shared, patch: api.patch,
		}, {
			legacy: 'user', alias: 'repository',
			personal: { name: 'Review', description: '', prompt: 'Review issues', disabled: false, triggers: {}, model: '' },
			shared: { name: 'Review', description: '', prompt: 'Review issues', disabled: false, triggers: {}, model: '', ownership: 'repository' },
			patch: { name: 'Renamed' },
		});
	});

	test('repository capability permits collaborator Repository automation actions', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		api.definitions = [{ ...definition, ownership: 'repository', created_by: { login: 'teammate' } }];
		await provider.refresh();
		const automation = provider.automations.get()[0];
		assert.deepStrictEqual({
			update: provider.canUpdateAutomation(automation.id), delete: provider.canDeleteAutomation(automation.id),
			run: provider.canRunAutomation(automation.id),
		}, { update: true, delete: true, run: true });
		await provider.updateAutomation(automation.id, { name: 'Updated' });
	});

	test('catalogue lookups reuse descriptors and update after publication', async () => {
		const { provider, api, set } = setup();
		let idReads = 0;
		api.definitions = [{
			...definition,
			get id() {
				idReads++;
				return 'counted';
			},
		}];
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const automation = provider.automations.get()[0];
		const projectedIdReads = idReads;
		const repeatedLookups = Array.from({ length: 5 }, () => ({
			automation: provider.getAutomation(automation.id),
			canRun: provider.canRunAutomation(automation.id),
			canUpdate: provider.canUpdateAutomation(automation.id),
			canDelete: provider.canDeleteAutomation(automation.id),
		}));

		api.definitions = [{ ...definition, id: 'replacement' }];
		await provider.refresh();
		assert.deepStrictEqual({
			idReads,
			projectedIdReads,
			repeatedLookups,
			previous: provider.getAutomation(automation.id),
			currentIds: provider.automations.get().map(current => JSON.parse(current.id).at(-1)),
		}, {
			idReads: projectedIdReads,
			projectedIdReads,
			repeatedLookups: Array.from({ length: 5 }, () => ({
				automation,
				canRun: true,
				canUpdate: true,
				canDelete: true,
			})),
			previous: undefined,
			currentIds: ['replacement'],
		});
	});

	test('manageability loss republishes automation capabilities after mutation revalidation', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const permissionStates: boolean[] = [];
		disposables.add(autorun(reader => {
			for (const automation of provider.automations.read(reader)) {
				permissionStates.push(provider.canUpdateAutomation(automation.id));
			}
		}));
		api.canManage = false;
		await assert.rejects(provider.updateAutomation(provider.automations.get()[0].id, { name: 'Updated' }), AutomationUnavailableError);
		assert.deepStrictEqual(permissionStates, [true, false]);
	});

	test('agent tools use the complete returned catalogue and retain provider permission checks', async () => {
		const { provider, api, set, tools, invoke } = setupTools();
		api.definitions = [
			{ ...definition, ownership: 'repository' },
			{ ...definition, id: 'shared', name: 'Shared review', ownership: 'repository', created_by: { login: 'teammate' }, prompt: 'Shared instructions' },
		];
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const shared = provider.automations.get().find(automation => JSON.parse(automation.id).at(-1) === 'shared')!;
		const [listed] = await invoke(tools.list, {});
		const updated = await invoke(tools.configure, { automationId: shared.id, name: 'Updated shared review' });
		assert.deepStrictEqual({
			names: listed.automations.map((automation: { name: string }) => automation.name),
			updated: updated.automation.name,
			patch: api.patch,
		}, {
			names: ['Review', 'Shared review'], updated: 'Updated shared review', patch: { name: 'Updated shared review' },
		});
	});

	test('unavailable collaborator history does not remove its Repository automation or block healthy history', async () => {
		const { provider, api, set } = setup();
		api.definitions = [
			{ ...definition, id: 'shared', ownership: 'repository', created_by: { login: 'teammate' } },
			{ ...definition, id: 'owned', ownership: 'repository' },
		];
		api.historyErrors.set('shared', new ApiRequestError(404, 'notFound'));
		api.tasks = [{ id: 'task', state: 'completed', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', remote_steerable: false }];
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		assert.deepStrictEqual({
			ids: provider.automations.get().map(automation => JSON.parse(automation.id).at(-1)),
			catalogue: provider.catalogueState.get(), history: provider.historyState.get(),
			runs: provider.runs.get().map(run => JSON.parse(run.automationId).at(-1)),
		}, { ids: ['shared', 'owned'], catalogue: 'ready', history: 'ready', runs: ['owned'] });
	});

	test('history 404 still removes a creator-owned Repository automation', async () => {
		const { provider, api, set } = setup();
		api.definitions = [{ ...definition, ownership: 'repository' }];
		api.historyError = new ApiRequestError(404, 'notFound');
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		assert.deepStrictEqual(provider.automations.get(), []);
	});

	test('creation forwards the raw Cloud model and rejects unsupported templates before dispatch', async () => {
		const { provider, api, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const options = { name: 'Hello', prompt: 'Say hello world', schedule: manual, target: provider.automations.get()[0].target };
		const templates: IAutomationSessionTemplate[] = [
			{ modelId: 'claude-opus-5.5', modelConfiguration: {} },
			{ modelId: 'claude-opus-5.5', modelConfiguration: { reasoningEffort: 'high' } },
			{ config: { mode: 'plan' } },
			{ config: { autoApprove: 'autopilot' } },
			{ agent: { uri: 'file:///agent.md' } },
		];
		for (const sessionTemplate of templates) {
			await assert.rejects(provider.createAutomation({ ...options, sessionTemplate }), /not supported/);
		}
		const dispatchedBeforeValid = api.calls.filter(call => call === 'create').length;
		await provider.createAutomation({ ...options, sessionTemplate: { modelId: 'claude-opus-5.5', config: { tools: ['read', 'future-tool'], reasoningEffort: 'high' } } });
		assert.deepStrictEqual({
			dispatchedBeforeValid, creates: api.calls.filter(call => call === 'create').length,
			model: api.created?.model, tools: api.created?.tools, reasoning: api.created?.reasoning_effort,
		}, { dispatchedBeforeValid: 0, creates: 1, model: 'claude-opus-5.5', tools: ['read', 'future-tool'], reasoning: 'high' });
	});
	test('roundtrips UTC schedules and keeps unknown triggers read-only', () => {
		const daily = { ...manual, interval: 'daily' as const, timeZone: 'UTC' as const, scheduleHour: 7, scheduleMinute: 15 };
		assert.deepStrictEqual({ daily: cloudAutomationSchedule(cloudAutomationTriggers(daily)), custom: cloudAutomationSchedule({ webhook: { types: ['issue'] } }).interval },
			{ daily, custom: 'custom' });
	});

	for (const timeZone of [undefined, 'UTC'] as const) {
		test(`rejects ${timeZone ?? 'local'} weekdays on create and update without mutating the cloud API`, async () => {
			const { provider, api, set } = setup();
			await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
			await provider.refresh();
			const automation = provider.automations.get()[0];
			const schedule: IAutomationSchedule = { interval: 'weekdays', timeZone, scheduleHour: 9, scheduleMinute: 15, scheduleDay: 0 };
			const error = /Choose a daily or weekly UTC schedule/;
			assert.throws(() => cloudAutomationTriggers(schedule), error);
			await assert.rejects(provider.createAutomation({ name: 'Weekday review', prompt: 'Review', target: automation.target, schedule }), error);
			await assert.rejects(provider.updateAutomation(automation.id, { schedule }), error);
			await assert.rejects(provider.updateAutomationIfUnchanged(automation.id, { schedule }, automation), error);
			assert.deepStrictEqual({
				mutations: api.calls.filter(call => call === 'create' || call === 'update'),
				patch: api.patch,
				schedule: provider.getAutomation(automation.id)?.schedule,
			}, { mutations: [], patch: undefined, schedule: automation.schedule });
		});
	}
});
