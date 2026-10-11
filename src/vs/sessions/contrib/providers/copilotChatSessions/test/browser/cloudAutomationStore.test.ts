/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { useFakeTimers } from 'sinon';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
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
import { AutomationDetail, AutomationToolGroup, CreateAutomationRequest, CreateAutomationTaskResponse, EditAutomationRequest, IAutomationsClient, ListRepoAutomationsResponse } from '../../../../../../platform/github/common/missionControl/automations.js';
import { ApiRequestError, MutationUncertainError } from '../../../../../../platform/github/common/missionControl/missionControlClient.js';
import { ITasksClient, ListTasksResponse, Task } from '../../../../../../platform/github/common/missionControl/tasks.js';
import { IGitHubCredentials } from '../../../../../../platform/github/common/githubCredentialService.js';
import { GitHubRepository, GitHubRepositoryRef } from '../../../../../../platform/github/common/githubQueryService.js';
import { IGitHubQuery } from '../../../../../../platform/github/common/githubQueryServiceImpl.js';
import { IGitHubClient } from '../../../../../../platform/github/common/githubService.js';
import { IGitHubEndpointProvider } from '../../../../../../platform/github/common/githubTypes.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IGitHubService } from '../../../../github/browser/githubService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAutomationSchedule, IAutomationSessionTemplate } from '../../../../../../workbench/contrib/chat/common/automations/automation.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING, CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING } from '../../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IWorkbenchGitHubService } from '../../../../../../workbench/services/github/common/githubService.js';
import { ISessionsRecentWorkspacesService } from '../../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../../../services/sessions/common/session.js';
import { CloudAutomationStore, cloudAutomationSchedule, cloudAutomationTriggers } from '../../browser/cloudAutomationStore.js';
import { IRepositoryPickResult, RepositoryPicker } from '../../../../../../workbench/contrib/chat/browser/agentSessions/repositoryPicker.js';
import { RepositoryRef } from '../../../../../../platform/github/common/client/types.js';
import { PaginatedResponse } from '../../../../../../platform/github/common/missionControl/missionControl.js';

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
	pendingHistory: Promise<void> | undefined;
	getError: Error | undefined;
	createError: Error | undefined;
	dispatchError: Error | undefined;
	pendingList: Promise<void> | undefined;
	pendingVisibility: Promise<boolean> | undefined;
	readonly visibilityStarted = new DeferredPromise<void>();
	lastSignal: AbortSignal | undefined;
	patch: EditAutomationRequest | undefined;
	created: CreateAutomationRequest | undefined;
	async isPrivateRepository(_repository: GitHubRepositoryRef, signal: AbortSignal): Promise<boolean> {
		this.calls.push('visibility');
		this.lastSignal = signal;
		await this.visibilityStarted.complete();
		return this.pendingVisibility ?? true;
	}
	override async list(): Promise<PaginatedResponse<ListRepoAutomationsResponse>> {
		this.calls.push('list');
		await this.pendingList;
		if (this.listError) {
			throw this.listError;
		}
		return { data: { automations: this.definitions, total_count: this.definitions.length } };
	}
	override async listRuns(): Promise<PaginatedResponse<ListTasksResponse>> {
		this.calls.push('history');
		await this.pendingHistory;
		if (this.historyError) {
			throw this.historyError;
		}
		return { data: { tasks: this.tasks } };
	}
	override async get(): Promise<AutomationDetail> {
		if (this.getError) {
			throw this.getError;
		}
		return this.definitions[0];
	}
	override async create(_repository: RepositoryRef, value: CreateAutomationRequest): Promise<AutomationDetail> {
		this.calls.push('create');
		this.created = value;
		if (this.createError) {
			throw this.createError;
		}
		return { ...definition, ...value };
	}
	override async update(_repository: RepositoryRef, _id: string, value: EditAutomationRequest): Promise<AutomationDetail> {
		this.patch = value;
		this.calls.push('update');
		return { ...this.definitions[0], ...value };
	}
	override async dispatch(): Promise<CreateAutomationTaskResponse> {
		this.calls.push('run');
		if (this.dispatchError) {
			throw this.dispatchError;
		}
		return {};
	}
	toolsError: Error | undefined;
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
	function setup(logService: ILogService = new NullLogService(), clientNotificationOrder?: 'before' | 'after', gitHubService: IGitHubService = upcastPartial<IGitHubService>({})) {
		const instantiation = disposables.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ chat: { automations: { enabled: true, cloud: { enabled: false } } } });
		const changed = disposables.add(new Emitter<IDefaultAccount | null>());
		const clientChanged = disposables.add(new Emitter<void>());
		if (clientNotificationOrder === 'before') {
			disposables.add(changed.event(() => clientChanged.fire()));
		}
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
				override async abort() { api.calls.push('stop'); }
			}();
			override readonly credentials = new class extends mock<IGitHubCredentials>() {
				override async getCredential() {
					return { account: { host: 'api.github.com', accountId: account.accountName }, token: 'test-token', generation: 1, signal: credentialLifetime.signal };
				}
			}();
		}();
		const lease = () => Object.assign(toDisposable(() => { }), { object: client });
		instantiation.stub(IWorkbenchGitHubService, new class extends mock<IWorkbenchGitHubService>() {
			override readonly onDidChangeDefaultClient = clientChanged.event;
			override async acquireDefaultAccountClient() { return lease(); }
			override acquireClient() { return lease(); }
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
		return { provider, api, accounts, changed, clientChanged, entitlement, sentimentChanged, set, instantiation };
	}

	test('idle definitions do not poll and postdispatch history discovery is bounded', async () => {
		const clock = useFakeTimers();
		try {
			const { provider, api, set } = setup();
			await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
			await provider.refresh();
			api.calls.length = 0;
			await clock.tickAsync(60_000);
			assert.deepStrictEqual(api.calls, []);
			await provider.runAutomation(provider.automations.get()[0].id);
			await clock.tickAsync(120_000);
			assert.deepStrictEqual(api.calls.filter(call => call !== 'visibility'), ['run', 'history', 'history', 'history', 'history', 'history']);
		} finally {
			clock.restore();
		}
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
		api.tasks = [{ id: 'task', state: 'in_progress', created_at: definition.created_at, remote_steerable: true }];
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		const run = provider.runs.get()[0];
		api.historyError = new Error('History offline');
		const accepted = await provider.runAutomation(provider.automations.get()[0].id);
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
		test(`uncertain ${error.name} dispatch discovers history without clearing mutation uncertainty`, async () => {
			const clock = useFakeTimers();
			try {
				const { provider, api, set } = setup();
				await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
				await provider.refresh();
				api.calls.length = 0;
				api.dispatchError = error;
				await assert.rejects(provider.runAutomation(provider.automations.get()[0].id), candidate => candidate === error);
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

	test('repository search offers only private repositories and accepts GitHub URLs', async () => {
		const queries: string[] = [];
		let authenticated = false;
		const { provider, set, instantiation } = setup(undefined, undefined, upcastPartial<IGitHubService>({
			authenticateForRepositoryAccess: async () => { authenticated = true; },
			getRepositories: async query => {
				queries.push(query);
				return [
					{ owner: 'owner', name: 'public', fullName: 'owner/public', defaultBranch: 'main', isPrivate: false, description: '' },
					{ owner: 'owner', name: 'private', fullName: 'owner/private', defaultBranch: 'main', isPrivate: true, description: '' },
				];
			},
		}));
		let placeholder: string | undefined;
		const repositories: Array<readonly string[]> = [];
		instantiation.stubInstance(RepositoryPicker, {
			pickRepository: async (search, options) => {
				placeholder = options?.placeholder;
				repositories.push(await search('', CancellationToken.None));
				repositories.push(await search('https://github.com/owner/private.git', CancellationToken.None));
				return { cloneUrl: 'https://github.com/owner/private.git' };
			},
			dispose: () => { },
		});
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		const selected = await provider.configuration.pickWorkspace(CancellationToken.None);
		assert.deepStrictEqual({ authenticated, queries, placeholder, repositories, selected: selected?.toString() }, {
			authenticated: true, queries: ['', 'owner/private'],
			placeholder: 'Search for a private repository or paste a repository URL...',
			repositories: [['owner/private'], ['owner/private']], selected: workspace.toString(),
		});
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

	test('cloud definitions link to their GitHub automation detail page', async () => {
		const { provider, set } = setup();
		await set(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		await provider.refresh();
		assert.strictEqual(provider.automations.get()[0].externalResource?.toString(), 'https://github.com/owner/private/agents/automations/one');
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
			assert.deepStrictEqual(api.calls, ['visibility', 'list']);
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
		await assert.rejects(provider.createAutomation(options), MutationUncertainError);
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
		const created = await provider.createAutomation({ ...options, schedule: { ...manual, interval: 'hourly' } });
		assert.strictEqual(created.enabled, true);
		const disabled = await provider.createAutomation({ ...options, enabled: false });
		assert.strictEqual(disabled.enabled, false);
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
