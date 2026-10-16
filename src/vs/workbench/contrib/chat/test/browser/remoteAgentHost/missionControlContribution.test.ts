/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, stub } from 'sinon';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostService, IMissionControlOptions } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IConfigurationChangeEvent, IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { FileOperationError, FileOperationResult, IFileService, IFileStatWithMetadata, IFileStatWithPartialMetadata } from '../../../../../../platform/files/common/files.js';
import { IPathService } from '../../../../../../platform/path/common/pathService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService, toWorkspaceFolder, Workspace } from '../../../../../../platform/workspace/common/workspace.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import '../../../browser/remoteAgentHost/remoteAgentHost.contribution.js';
import { MissionControlSharingService } from '../../../browser/remoteAgentHost/missionControlSharingService.js';

const localCredentialSetting = 'chat.agentHost.experimentalMissionControl.useLocalCredentials';
const remoteControlPolicyOverrideSetting = 'chat.agentHost.experimentalMissionControl.ignoreRemoteControlPolicy';
const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
const remoteConnectionsSetting = configurationProperties[AgentHostRemoteConnectionsSettingId];
const localCredentialSettingRegistered = configurationProperties[localCredentialSetting] !== undefined;
const remoteControlPolicyOverrideSettingRegistered = configurationProperties[remoteControlPolicyOverrideSetting] !== undefined;
const registeredMissionControlSettings = Object.keys(configurationProperties)
	.filter(key => key.startsWith('chat.agentHost.experimentalMissionControl'))
	.map(key => ({ key, default: configurationProperties[key].default }));
const removedSettings = {
	'chat.agentHost.experimentalMissionControl.enabled': true,
	'chat.agentHost.experimentalMissionControl.endpoint': 'https://example.invalid',
	'chat.agentHost.experimentalMissionControl.requireConnectionBinding': true,
	'chat.agentHost.experimentalMissionControlFakeEndpoint': 'http://127.0.0.1:1234',
};
const session: AuthenticationSession = { id: 'session', account: { id: 'account', label: 'Account' }, scopes: ['read:user', 'user:email', 'repo', 'workflow'], accessToken: 'test-token' };
const workspaceRoot = URI.file('/mission-control-workspace');
const home = URI.file('/mission-control-home');
const expectedOptions: IMissionControlOptions = {
	baseUrl: 'https://api.github.com',
	accountId: 'account',
	credential: 'test-token',
	roots: [URI.file('/').fsPath, home.fsPath, workspaceRoot.fsPath],
	projects: [workspaceRoot.fsPath],
	defaultDirectory: home.fsPath,
	live: true,
};

suite('Mission Control sharing service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => restore());

	function fixture(options: {
		backend?: AgentHostRemoteConnectionsBackend;
		emptyWindow?: boolean;
		storage?: InMemoryStorageService;
		getSessions?: IAuthenticationService['getSessions'];
		createSession?: IAuthenticationService['createSession'];
		defaultAccount?: IDefaultAccount;
		configure?: (options: IMissionControlOptions | undefined) => Promise<void>;
		stat?: IFileService['stat'];
		realpath?: IFileService['realpath'];
		createFolder?: IFileService['createFolder'];
		windows?: boolean;
		userHome?: URI;
		localSetting?: string;
		localSettingConfig?: IConfigurationValue<boolean>;
	} = {}) {
		const instantiation = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ [AgentHostRemoteConnectionsSettingId]: options.backend ?? 'githubEnvironment', ...removedSettings });
		const fixtureHome = options.userHome ?? home;
		const storage = options.storage ?? store.add(new InMemoryStorageService());
		store.add(configuration.onDidChangeConfigurationEmitter);
		if (options.localSetting && options.localSettingConfig) {
			stub(configuration, 'inspect').callThrough().withArgs(options.localSetting).returns(options.localSettingConfig);
		}
		const sentimentChanged = store.add(new Emitter<void>());
		const hostStarted = store.add(new Emitter<void>());
		const sessionsChanged = store.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
		const defaultAccountChanged = store.add(new Emitter<IDefaultAccount | null>());
		let defaultAccount = options.defaultAccount ?? null;
		instantiation.stub(IDefaultAccountService, new class extends mock<IDefaultAccountService>() {
			override readonly onDidChangeDefaultAccount = defaultAccountChanged.event;
			override async getDefaultAccount() { return defaultAccount; }
		}());
		let hidden = false;
		let starts = 0;
		const calls: { options: IMissionControlOptions | undefined; withdrawingAccountId: string | undefined }[] = [];
		instantiation.stub(IAgentHostService, new class extends mock<IAgentHostService>() {
			override readonly onAgentHostStart = hostStarted.event;
			override startAgentHost(): void { starts++; }
			override async configureMissionControl(missionControlOptions: IMissionControlOptions | undefined, withdrawingAccountId?: string): Promise<void> {
				calls.push({ options: missionControlOptions, withdrawingAccountId });
				await options.configure?.(missionControlOptions);
			}
		}());
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = sessionsChanged.event;
			override async getSessions(...args: Parameters<IAuthenticationService['getSessions']>) {
				return options.getSessions ? options.getSessions(...args) : [session];
			}
			override async createSession(...args: Parameters<IAuthenticationService['createSession']>) {
				return options.createSession ? options.createSession(...args) : session;
			}
		}());
		instantiation.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeSentiment = sentimentChanged.event;
			override get sentiment() { return { hidden }; }
		}());
		instantiation.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = Event.None;
			override getWorkspace() { return new Workspace('workspace', options.emptyWindow ? [] : [toWorkspaceFolder(workspaceRoot)], false, null, () => false); }
		}());
		instantiation.stub(IProductService, { quality: 'insider' });
		const logService = store.add(new NullLogService());
		instantiation.stub(ILogService, logService);
		instantiation.stub(IStorageService, storage);
		const notificationService = new TestNotificationService();
		instantiation.stub(INotificationService, notificationService);
		instantiation.stub(IPathService, new class extends mock<IPathService>() {
			override userHome(options: { preferLocal: true }): URI;
			override userHome(options?: { preferLocal: boolean }): Promise<URI>;
			override userHome(options?: { preferLocal: boolean }): URI | Promise<URI> {
				const directory = fixtureHome;
				return options?.preferLocal ? directory : Promise.resolve(directory);
			}
		}());
		const createdFolders: URI[] = [];
		instantiation.stub(IFileService, new class extends mock<IFileService>() {
			override async realpath(resource: URI): Promise<URI | undefined> {
				return options.realpath ? options.realpath(resource) : resource;
			}
			override async stat(resource: URI): Promise<IFileStatWithPartialMetadata> {
				return options.stat ? options.stat(resource) : upcastPartial<IFileStatWithPartialMetadata>({ resource, isDirectory: true });
			}
			override async createFolder(resource: URI): Promise<IFileStatWithMetadata> {
				createdFolders.push(resource);
				return options.createFolder ? options.createFolder(resource) : upcastPartial<IFileStatWithMetadata>({ resource, isDirectory: true });
			}
		}());
		const sharing = store.add(instantiation.createInstance(class extends MissionControlSharingService {
			protected override get isWindowsPlatform(): boolean { return options.windows ?? false; }
		}));
		return {
			calls, configuration, storage, sharing, hostStarted, sessionsChanged, createdFolders, logService, notificationService, starts: () => starts,
			disableAI: () => { hidden = true; sentimentChanged.fire(); },
			changeDefaultAccount: (account: IDefaultAccount | null) => { defaultAccount = account; defaultAccountChanged.fire(account); },
		};
	}

	test('registers a backend selector rather than an enablement setting', () => {
		assert.deepStrictEqual({
			removed: registeredMissionControlSettings,
			localCredentialSettingRegistered,
			remoteControlPolicyOverrideSettingRegistered,
			backend: {
				default: remoteConnectionsSetting.default,
				enum: remoteConnectionsSetting.enum,
			},
		}, { removed: [], localCredentialSettingRegistered: false, remoteControlPolicyOverrideSettingRegistered: false, backend: { default: 'devTunnel', enum: ['devTunnel', 'githubEnvironment'] } });
	});

	for (const backend of ['devTunnel', 'githubEnvironment', 'missionControl'] as const) {
		test(`selecting ${backend} does not enable sharing`, () => runWithFakedTimers({}, async () => {
			const { sharing, calls, starts } = fixture({ backend });
			await timeout(0);
			assert.deepStrictEqual({ state: sharing.state.get(), starts: starts(), calls }, { state: 'disabled', starts: 0, calls: [] });
		}));
	}

	for (const [setting, option] of [
		[localCredentialSetting, 'useLocalCredentials'],
		[remoteControlPolicyOverrideSetting, 'ignoreRemoteControlPolicy'],
	] as const) {
		for (const scenario of [
			{ name: 'local user opt-in in Insiders', config: { value: false, userLocalValue: true }, enabled: true },
			{ name: 'application user opt-in', config: { value: true, applicationValue: true }, enabled: true },
			{ name: 'local user refusal overrides application opt-in', config: { applicationValue: true, userLocalValue: false }, enabled: false },
			{ name: 'workspace value', config: { value: true, workspaceValue: true }, enabled: false },
			{ name: 'workspace folder value', config: { value: true, workspaceFolderValue: true }, enabled: false },
			{ name: 'remote user value', config: { value: true, userRemoteValue: true }, enabled: false },
			{ name: 'default value', config: { value: true, defaultValue: true }, enabled: false },
		]) {
			test(`uses only explicit local-user ${option}: ${scenario.name}`, () => runWithFakedTimers({}, async () => {
				const { calls, sharing } = fixture({ localSetting: setting, localSettingConfig: scenario.config });
				await sharing.setEnabled(true);
				await timeout(0);
				assert.deepStrictEqual(calls, [{
					options: { ...expectedOptions, ...(scenario.enabled ? { [option]: true } : {}) },
					withdrawingAccountId: undefined,
				}]);
			}));
		}

		test(`withdraws the previous registration when ${option} changes and reconfigures`, () => runWithFakedTimers({}, async () => {
			const { calls, configuration, sharing } = fixture();
			await sharing.setEnabled(true);
			await timeout(0);
			for (const enabled of [true, false]) {
				await configuration.setUserConfiguration(setting, enabled);
				configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
					override affectsConfiguration(section: string) { return section === setting; }
				}());
				await timeout(0);
			}
			assert.deepStrictEqual(calls, [
				{ options: expectedOptions, withdrawingAccountId: undefined },
				{ options: undefined, withdrawingAccountId: 'account' },
				{ options: { ...expectedOptions, [option]: true }, withdrawingAccountId: undefined },
				{ options: undefined, withdrawingAccountId: 'account' },
				{ options: expectedOptions, withdrawingAccountId: undefined },
			]);
		}));

		test(`changing ${option} does not enable sharing`, () => runWithFakedTimers({}, async () => {
			const { calls, configuration, sharing } = fixture();
			await configuration.setUserConfiguration(setting, true);
			configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string) { return section === setting; }
			}());
			await timeout(0);
			assert.deepStrictEqual({ calls, state: sharing.state.get() }, { calls: [], state: 'disabled' });
		}));
	}

	for (const enabled of [false, true]) {
		test(`ignores removed settings when registration is ${enabled ? 'enabled' : 'disabled'}`, () => runWithFakedTimers({}, async () => {
			const { calls, starts, sharing } = fixture();
			await sharing.setEnabled(enabled);
			await timeout(0);
			assert.deepStrictEqual({ starts: starts(), calls }, {
				starts: enabled ? 1 : 0,
				calls: enabled ? [{ options: expectedOptions, withdrawingAccountId: undefined }] : [],
			});
		}));
	}

	test('registers an empty window without a test-endpoint workspace requirement', () => runWithFakedTimers({}, async () => {
		const { calls, sharing } = fixture({ emptyWindow: true });
		await sharing.setEnabled(true);
		await timeout(0);
		assert.deepStrictEqual(calls, [{ options: { ...expectedOptions, roots: [URI.file('/').fsPath, home.fsPath], projects: [] }, withdrawingAccountId: undefined }]);
	}));

	test('shares the filesystem independently of a changing local recent-folder catalogue', () => runWithFakedTimers({}, async () => {
		const { sharing, calls, createdFolders } = fixture();
		const outsideHome = URI.file('/another-drive/repository');
		sharing.setProjectFolders([outsideHome, URI.parse('vscode-remote://ssh-remote+host/project'), outsideHome]);
		await sharing.setEnabled(true);
		await timeout(0);
		sharing.setProjectFolders([joinPath(home, 'code', 'repository')]);
		await timeout(0);
		sharing.setProjectFolders([]);
		await timeout(0);
		sharing.setProjectFolders([]);
		await timeout(0);
		assert.deepStrictEqual({
			options: calls.map(call => call.options),
			createdFolders: createdFolders.map(folder => folder.path),
		}, {
			options: [
				{ ...expectedOptions, roots: [URI.file('/').fsPath, home.fsPath, outsideHome.fsPath], projects: [outsideHome.fsPath] },
				{ ...expectedOptions, roots: [URI.file('/').fsPath, home.fsPath, joinPath(home, 'code', 'repository').fsPath], projects: [joinPath(home, 'code', 'repository').fsPath] },
				{ ...expectedOptions, roots: [URI.file('/').fsPath, home.fsPath], projects: [] },
			],
			createdFolders: [],
		});
	}));

	test('omits missing recent folders and non-directories from grants and the catalogue', () => runWithFakedTimers({}, async () => {
		const { sharing, calls } = fixture({
			stat: async resource => {
				if (resource.path === '/missing') {
					throw new FileOperationError('Missing directory', FileOperationResult.FILE_NOT_FOUND);
				}
				if (resource.path === '/file/child') {
					throw new FileOperationError('Parent is not a directory', FileOperationResult.FILE_NOT_DIRECTORY);
				}
				return upcastPartial<IFileStatWithPartialMetadata>({ resource, isDirectory: resource.path !== '/file' });
			},
		});
		sharing.setProjectFolders([URI.file('/missing'), URI.file('/file'), URI.file('/file/child'), workspaceRoot]);
		await sharing.setEnabled(true);
		assert.deepStrictEqual(calls, [{ options: expectedOptions, withdrawingAccountId: undefined }]);
	}));

	test('shares all available Windows drives but starts at home without creating a directory', () => runWithFakedTimers({}, async () => {
		const windowsHome = URI.parse('file:///C:/Users/test');
		const statRequests: string[] = [];
		const { sharing, calls, createdFolders } = fixture({
			windows: true, emptyWindow: true, userHome: windowsHome,
			stat: async resource => {
				statRequests.push(resource.path);
				if (!['/C:/', '/D:/', '/Z:/'].includes(resource.path)) {
					throw new FileOperationError('Drive not found', FileOperationResult.FILE_NOT_FOUND);
				}
				return upcastPartial<IFileStatWithPartialMetadata>({ resource, isDirectory: true });
			},
			realpath: async resource => resource.path === '/Z:/' ? resource.with({ path: '\\\\server\\share\\' }) : resource,
		});
		await sharing.setEnabled(true);
		assert.deepStrictEqual({ options: calls[0].options, statRequests, createdFolders }, {
			options: {
				...expectedOptions, roots: [URI.parse('file:///C:/').fsPath, URI.parse('file:///D:/').fsPath, windowsHome.fsPath],
				projects: [], defaultDirectory: windowsHome.fsPath,
			},
			statRequests: Array.from({ length: 26 }, (_, index) => `/${String.fromCharCode(65 + index)}:/`),
			createdFolders: [],
		});
	}));

	test('reports unexpected drive enumeration failures instead of granting a partial filesystem', () => runWithFakedTimers({}, async () => {
		const { sharing, calls } = fixture({
			windows: true,
			stat: async () => { throw new Error('Filesystem unavailable'); },
		});
		await assert.rejects(sharing.setEnabled(true), /Filesystem unavailable/);
		assert.deepStrictEqual({ state: sharing.state.get(), calls }, { state: 'disabled', calls: [] });
	}));

	test('does not reconfigure when removed settings change', () => runWithFakedTimers({}, async () => {
		const { calls, configuration, sharing } = fixture();
		await sharing.setEnabled(true);
		await timeout(0);
		for (const setting of Object.keys(removedSettings)) {
			configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string) { return section === setting; }
			}());
		}
		await timeout(0);
		assert.deepStrictEqual(calls, [{ options: expectedOptions, withdrawingAccountId: undefined }]);
	}));

	test('withdraws registration when the toggle is disabled', () => runWithFakedTimers({}, async () => {
		const { calls, sharing } = fixture();
		await sharing.setEnabled(true);
		await timeout(0);
		await sharing.setEnabled(false);
		await timeout(0);
		assert.deepStrictEqual(calls, [
			{ options: expectedOptions, withdrawingAccountId: undefined },
			{ options: undefined, withdrawingAccountId: 'account' },
		]);
	}));

	test('withdraws registration when AI features are hidden', () => runWithFakedTimers({}, async () => {
		const { calls, disableAI, sharing } = fixture();
		await sharing.setEnabled(true);
		await timeout(0);
		disableAI();
		await timeout(0);
		assert.deepStrictEqual(calls, [
			{ options: expectedOptions, withdrawingAccountId: undefined },
			{ options: undefined, withdrawingAccountId: 'account' },
		]);
	}));

	test('changing backends withdraws registration and requires a new opt-in', () => runWithFakedTimers({}, async () => {
		const { sharing, calls, configuration, storage } = fixture();
		await sharing.setEnabled(true);
		for (const backend of ['devTunnel', 'githubEnvironment']) {
			await configuration.setUserConfiguration(AgentHostRemoteConnectionsSettingId, backend);
			configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string) { return section === AgentHostRemoteConnectionsSettingId; }
			}());
			await timeout(0);
		}
		const restored = fixture({ storage });
		await timeout(0);
		assert.deepStrictEqual({
			state: sharing.state.get(), restored: restored.sharing.state.get(), restoredCalls: restored.calls, calls,
		}, {
			state: 'disabled', restored: 'disabled', restoredCalls: [],
			calls: [
				{ options: expectedOptions, withdrawingAccountId: undefined },
				{ options: undefined, withdrawingAccountId: 'account' },
				{ options: undefined, withdrawingAccountId: 'account' },
			],
		});
	}));

	for (const backend of ['githubEnvironment', 'missionControl'] as const) {
		test(`restores an explicit sharing choice after window reload (${backend})`, () => runWithFakedTimers({}, async () => {
			const first = fixture({ backend });
			await first.sharing.setEnabled(true);
			first.sharing.dispose();
			const restored = fixture({ backend, storage: first.storage });
			await timeout(0);
			assert.deepStrictEqual({ state: restored.sharing.state.get(), calls: restored.calls }, {
				state: 'enabled', calls: [{ options: expectedOptions, withdrawingAccountId: undefined }],
			});
		}));
	}

	test('reconfigures after the native host restarts', () => runWithFakedTimers({}, async () => {
		const { sharing, calls, hostStarted } = fixture();
		await sharing.setEnabled(true);
		hostStarted.fire();
		await timeout(0);
		assert.deepStrictEqual({ state: sharing.state.get(), calls }, {
			state: 'enabled', calls: [
				{ options: expectedOptions, withdrawingAccountId: undefined },
				{ options: expectedOptions, withdrawingAccountId: undefined },
			],
		});
	}));

	test('allows cancelling registration while authentication is pending', () => runWithFakedTimers({}, async () => {
		const sessions = new DeferredPromise<readonly AuthenticationSession[]>();
		const { sharing, calls } = fixture({ getSessions: () => sessions.p });
		const enabling = sharing.setEnabled(true);
		assert.strictEqual(sharing.state.get(), 'connecting');
		await sharing.setEnabled(false);
		sessions.complete([session]);
		await enabling;
		assert.deepStrictEqual({ state: sharing.state.get(), calls }, { state: 'disabled', calls: [] });
	}));

	test('does not restore sharing in another window before explicit enablement succeeds', () => runWithFakedTimers({}, async () => {
		const sessions = new DeferredPromise<readonly AuthenticationSession[]>();
		const first = fixture({ getSessions: () => sessions.p });
		const enabling = first.sharing.setEnabled(true);
		const other = fixture({ storage: first.storage });
		await timeout(0);
		assert.deepStrictEqual({ state: other.sharing.state.get(), calls: other.calls }, { state: 'disabled', calls: [] });
		sessions.complete([session]);
		await enabling;
	}));

	test('withdraws in-flight registration without publishing a stale enabled state', () => runWithFakedTimers({}, async () => {
		const configuring = new DeferredPromise<void>();
		const { sharing, calls } = fixture({ configure: options => options ? configuring.p : Promise.resolve() });
		const enabling = sharing.setEnabled(true);
		await timeout(0);
		await sharing.setEnabled(false);
		configuring.complete();
		await enabling;
		assert.deepStrictEqual({ state: sharing.state.get(), calls }, {
			state: 'disabled', calls: [
				{ options: expectedOptions, withdrawingAccountId: undefined },
				{ options: undefined, withdrawingAccountId: 'account' },
			],
		});
	}));

	test('failed registration rejects and clears the remembered opt-in', () => runWithFakedTimers({}, async () => {
		const { sharing, calls, storage } = fixture({
			configure: async options => { if (options) { throw new Error('Registration failed'); } },
		});
		await assert.rejects(sharing.setEnabled(true), /Registration failed/);
		const restored = fixture({ storage });
		await timeout(0);
		assert.deepStrictEqual({ state: sharing.state.get(), restoredCalls: restored.calls, calls }, {
			state: 'disabled', restoredCalls: [], calls: [
				{ options: expectedOptions, withdrawingAccountId: undefined },
				{ options: undefined, withdrawingAccountId: 'account' },
			],
		});
	}));

	for (const message of ['fetch failed', 'Mission Control WPS connection closed before joining control group']) {
		for (const trigger of ['window reload', 'host restart'] as const) {
			test(`logs background configuration failure without notifying after ${trigger}: ${message}`, () => runWithFakedTimers({}, async () => {
				const error = new Error(message);
				let failing = false;
				const configure = async (options: IMissionControlOptions | undefined) => {
					if (options && failing) {
						throw error;
					}
				};
				const first = fixture({ configure });
				await first.sharing.setEnabled(true);
				await timeout(0);
				failing = true;
				if (trigger === 'window reload') {
					first.sharing.dispose();
				}
				const current = trigger === 'window reload' ? fixture({ storage: first.storage, configure }) : first;
				const logError = stub(current.logService, 'error');
				const notify = stub(current.notificationService, 'notify').callThrough();
				current.calls.length = 0;
				if (trigger === 'host restart') {
					current.hostStarted.fire();
				}
				await timeout(0);
				assert.deepStrictEqual({
					state: current.sharing.state.get(),
					calls: current.calls,
					loggedErrors: logError.args,
					notifications: notify.callCount,
				}, {
					state: 'disabled',
					calls: [
						{ options: expectedOptions, withdrawingAccountId: undefined },
						{ options: undefined, withdrawingAccountId: 'account' },
					],
					loggedErrors: [['Mission Control configuration failed', error]],
					notifications: 0,
				});
			}));
		}
	}

	test('logs background withdrawal failure without notifying', () => runWithFakedTimers({}, async () => {
		const error = new Error('fetch failed');
		const { sharing, disableAI, logService, notificationService } = fixture({
			configure: async options => {
				if (!options) {
					throw error;
				}
			},
		});
		await sharing.setEnabled(true);
		await timeout(0);
		const logError = stub(logService, 'error');
		const notify = stub(notificationService, 'notify').callThrough();
		disableAI();
		await timeout(0);
		assert.deepStrictEqual({
			state: sharing.state.get(),
			loggedErrors: logError.args,
			notifications: notify.callCount,
		}, {
			state: 'disabled',
			loggedErrors: [['Mission Control withdrawal failed', error]],
			notifications: 0,
		});
	}));

	test('prompts for GitHub sign-in only when explicitly enabled', () => runWithFakedTimers({}, async () => {
		const { sharing, calls } = fixture({ getSessions: async () => [] });
		await sharing.setEnabled(true);
		assert.deepStrictEqual(calls, [{ options: expectedOptions, withdrawingAccountId: undefined }]);
	}));

	test('withdraws immediately when the sharing account signs out', () => runWithFakedTimers({}, async () => {
		const { sharing, calls, sessionsChanged } = fixture();
		await sharing.setEnabled(true);
		sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { removed: [session], added: undefined, changed: undefined } });
		assert.deepStrictEqual({ state: sharing.state.get(), calls }, {
			state: 'disabled', calls: [
				{ options: expectedOptions, withdrawingAccountId: undefined },
				{ options: undefined, withdrawingAccountId: 'account' },
			],
		});
	}));

	test('does not register an ambiguous account or bypass disabled AI', () => runWithFakedTimers({}, async () => {
		const ambiguous = fixture({ getSessions: async () => [session, { ...session, account: { id: 'second', label: 'Second' } }] });
		await assert.rejects(ambiguous.sharing.setEnabled(true), /Select a GitHub account for Copilot/);
		const hidden = fixture();
		hidden.disableAI();
		await assert.rejects(hidden.sharing.setEnabled(true), /sharing is unavailable/);
		assert.deepStrictEqual({ ambiguous: ambiguous.calls, hidden: hidden.calls }, { ambiguous: [], hidden: [] });
	}));

	const copilotAccount: IDefaultAccount = {
		authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
		accountName: session.account.label,
		sessionId: 'copilot-session',
		enterprise: false,
	};
	const copilotSession: AuthenticationSession = { ...session, id: copilotAccount.sessionId, scopes: ['read:user'], accessToken: 'copilot-token' };
	const otherSession: AuthenticationSession = { ...session, id: 'other-session', account: { id: 'other', label: 'Other' }, accessToken: 'other-token' };

	test('uses the Copilot account with sharing scopes when multiple GitHub accounts are signed in', () => runWithFakedTimers({}, async () => {
		const getSessions = stub().callsFake(async (_providerId: string, scopes?: readonly string[]) => scopes ? [otherSession, session] : [otherSession, copilotSession, session]);
		const { sharing, calls } = fixture({ defaultAccount: copilotAccount, getSessions });
		await sharing.setEnabled(true);
		assert.deepStrictEqual({
			state: sharing.state.get(),
			calls,
			sessionRequests: getSessions.args,
		}, {
			state: 'enabled',
			calls: [{ options: expectedOptions, withdrawingAccountId: undefined }],
			sessionRequests: [
				['github', undefined, undefined, true],
				['github', [...session.scopes], { account: session.account }, true],
			],
		});
	}));

	test('requests missing sharing scopes for the Copilot account instead of using another account', () => runWithFakedTimers({}, async () => {
		const createSession = stub().resolves(session);
		const { sharing, calls } = fixture({
			defaultAccount: copilotAccount,
			getSessions: async (_providerId, scopes) => scopes ? [otherSession] : [otherSession, copilotSession],
			createSession,
		});
		await sharing.setEnabled(true);
		assert.deepStrictEqual({ calls, signIn: createSession.args }, {
			calls: [{ options: expectedOptions, withdrawingAccountId: undefined }],
			signIn: [['github', [...session.scopes], { account: session.account }]],
		});
	}));

	test('rejects sign-in to a different account when requesting sharing scopes', () => runWithFakedTimers({}, async () => {
		const { sharing, calls } = fixture({
			defaultAccount: copilotAccount,
			getSessions: async (_providerId, scopes) => scopes ? [] : [copilotSession],
			createSession: async () => otherSession,
		});
		await assert.rejects(sharing.setEnabled(true), /Sign in with the selected Copilot account/);
		assert.deepStrictEqual({ state: sharing.state.get(), calls }, { state: 'disabled', calls: [] });
	}));

	for (const error of [new Error('Cancelled'), 'Cancelled']) {
		test(`normalizes GitHub sign-in cancellation (${typeof error})`, () => runWithFakedTimers({}, async () => {
			const { sharing, calls, storage } = fixture({
				defaultAccount: copilotAccount,
				getSessions: async (_providerId, scopes) => scopes ? [] : [copilotSession],
				createSession: async () => { throw error; },
			});
			await assert.rejects(sharing.setEnabled(true), isCancellationError);
			const restored = fixture({ storage });
			await timeout(0);
			assert.deepStrictEqual({ state: sharing.state.get(), calls, restoredCalls: restored.calls }, {
				state: 'disabled', calls: [], restoredCalls: [],
			});
		}));
	}

	for (const defaultAccount of [
		{ ...copilotAccount, sessionId: 'missing' },
		{ ...copilotAccount, authenticationProvider: { id: 'github-enterprise', name: 'GitHub Enterprise', enterprise: true } },
	]) {
		test(`does not fall back to another account when the Copilot account is unavailable (${defaultAccount.authenticationProvider.id}, ${defaultAccount.sessionId})`, () => runWithFakedTimers({}, async () => {
			const { sharing, calls } = fixture({ defaultAccount });
			await assert.rejects(sharing.setEnabled(true), /Copilot account/);
			assert.deepStrictEqual({ state: sharing.state.get(), calls }, { state: 'disabled', calls: [] });
		}));
	}

	for (const account of [null, { ...copilotAccount, sessionId: otherSession.id, accountName: otherSession.account.label }]) {
		test(`withdraws sharing on Copilot ${account ? 'account change' : 'sign-out'} and requires a new opt-in`, () => runWithFakedTimers({}, async () => {
			const { sharing, calls, storage, changeDefaultAccount } = fixture({
				defaultAccount: copilotAccount,
				getSessions: async (_providerId, scopes) => scopes ? [session, otherSession] : [copilotSession, session, otherSession],
			});
			await sharing.setEnabled(true);
			changeDefaultAccount(account);
			await timeout(0);
			const restored = fixture({ storage });
			await timeout(0);
			assert.deepStrictEqual({ state: sharing.state.get(), calls, restoredCalls: restored.calls }, {
				state: 'disabled',
				calls: [
					{ options: expectedOptions, withdrawingAccountId: undefined },
					{ options: undefined, withdrawingAccountId: session.account.id },
				],
				restoredCalls: [],
			});
		}));
	}

	test('does not register a stale Copilot account after it changes during authentication', () => runWithFakedTimers({}, async () => {
		const sessions = new DeferredPromise<readonly AuthenticationSession[]>();
		const { sharing, calls, changeDefaultAccount } = fixture({
			defaultAccount: copilotAccount,
			getSessions: () => sessions.p,
		});
		const enabling = sharing.setEnabled(true);
		await timeout(0);
		changeDefaultAccount({ ...copilotAccount, sessionId: otherSession.id, accountName: otherSession.account.label });
		sessions.complete([copilotSession, session]);
		await enabling;
		await timeout(0);
		assert.deepStrictEqual({ state: sharing.state.get(), calls }, { state: 'disabled', calls: [] });
	}));

	test('requires fresh consent when selecting Copilot after sharing with a fallback account', () => runWithFakedTimers({}, async () => {
		let sessions = [session];
		const { sharing, calls, storage, changeDefaultAccount } = fixture({ getSessions: async () => sessions });
		await sharing.setEnabled(true);
		sessions = [otherSession];
		changeDefaultAccount({ ...copilotAccount, accountName: otherSession.account.label, sessionId: otherSession.id });
		sharing.setProjectFolders([workspaceRoot]);
		await timeout(0);
		const restored = fixture({ storage });
		await timeout(0);
		assert.deepStrictEqual({ state: sharing.state.get(), calls, restoredCalls: restored.calls }, {
			state: 'disabled',
			calls: [
				{ options: expectedOptions, withdrawingAccountId: undefined },
				{ options: undefined, withdrawingAccountId: session.account.id },
			],
			restoredCalls: [],
		});
	}));

	test('restoring sharing does not prompt for missing scopes or use another account', () => runWithFakedTimers({}, async () => {
		const first = fixture();
		await first.sharing.setEnabled(true);
		first.sharing.dispose();
		const createSession = stub().resolves(session);
		const { sharing, calls } = fixture({
			storage: first.storage,
			defaultAccount: copilotAccount,
			getSessions: async (_providerId, scopes) => scopes ? [otherSession] : [copilotSession, otherSession],
			createSession,
		});
		await timeout(0);
		assert.deepStrictEqual({ state: sharing.state.get(), calls, signIn: createSession.args }, { state: 'disabled', calls: [], signIn: [] });
	}));

	test('does not withdraw sharing when the Copilot session changes for the same account', () => runWithFakedTimers({}, async () => {
		const { sharing, calls, changeDefaultAccount } = fixture({
			defaultAccount: copilotAccount,
			getSessions: async (_providerId, scopes) => scopes ? [session] : [copilotSession, session],
		});
		await sharing.setEnabled(true);
		changeDefaultAccount({ ...copilotAccount, sessionId: session.id });
		await timeout(0);
		assert.deepStrictEqual({ state: sharing.state.get(), calls }, {
			state: 'enabled', calls: [
				{ options: expectedOptions, withdrawingAccountId: undefined },
				{ options: expectedOptions, withdrawingAccountId: undefined },
			],
		});
	}));

	test('recovers sharing after atomic session replacement and delayed Copilot reconciliation', () => runWithFakedTimers({}, async () => {
		let sessions = [copilotSession, session];
		const { sharing, calls, sessionsChanged, changeDefaultAccount } = fixture({
			defaultAccount: copilotAccount,
			getSessions: async (_providerId, scopes) => scopes ? sessions.filter(candidate => candidate.scopes.length === session.scopes.length) : sessions,
		});
		await sharing.setEnabled(true);
		const replacement = { ...session, id: 'replacement-session', accessToken: 'replacement-token' };
		sessions = [replacement];
		sessionsChanged.fire({
			providerId: 'github', label: 'GitHub',
			event: { removed: [copilotSession, session], added: [replacement], changed: undefined },
		});
		await timeout(100);
		changeDefaultAccount({ ...copilotAccount, sessionId: replacement.id });
		await timeout(0);
		assert.deepStrictEqual({ state: sharing.state.get(), calls }, {
			state: 'enabled',
			calls: [
				{ options: expectedOptions, withdrawingAccountId: undefined },
				{ options: undefined, withdrawingAccountId: session.account.id },
				{ options: { ...expectedOptions, credential: replacement.accessToken }, withdrawingAccountId: undefined },
			],
		});
	}));
});
