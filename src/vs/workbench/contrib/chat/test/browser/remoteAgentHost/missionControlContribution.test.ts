/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, stub } from 'sinon';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostService, IMissionControlOptions } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IConfigurationChangeEvent, IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
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
const expectedOptions: IMissionControlOptions = {
	baseUrl: 'https://api.github.com',
	accountId: 'account',
	credential: 'test-token',
	roots: [workspaceRoot.fsPath],
	live: true,
};

suite('Mission Control sharing service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => restore());

	function fixture(options: {
		backend?: AgentHostRemoteConnectionsBackend;
		emptyWindow?: boolean;
		storage?: InMemoryStorageService;
		getSessions?: () => Promise<readonly AuthenticationSession[]>;
		configure?: (options: IMissionControlOptions | undefined) => Promise<void>;
		localSetting?: string;
		localSettingConfig?: IConfigurationValue<boolean>;
	} = {}) {
		const instantiation = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ [AgentHostRemoteConnectionsSettingId]: options.backend ?? 'githubEnvironment', ...removedSettings });
		const storage = options.storage ?? store.add(new InMemoryStorageService());
		store.add(configuration.onDidChangeConfigurationEmitter);
		if (options.localSetting && options.localSettingConfig) {
			stub(configuration, 'inspect').callThrough().withArgs(options.localSetting).returns(options.localSettingConfig);
		}
		const sentimentChanged = store.add(new Emitter<void>());
		const hostStarted = store.add(new Emitter<void>());
		const sessionsChanged = store.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
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
			override async getSessions() {
				return options.getSessions ? options.getSessions() : [session];
			}
			override async createSession() { return session; }
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
		instantiation.stub(ILogService, store.add(new NullLogService()));
		instantiation.stub(IStorageService, storage);
		instantiation.stub(INotificationService, new TestNotificationService());
		const sharing = store.add(instantiation.createInstance(MissionControlSharingService));
		return {
			calls, configuration, storage, sharing, hostStarted, sessionsChanged, starts: () => starts,
			disableAI: () => { hidden = true; sentimentChanged.fire(); },
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
		assert.deepStrictEqual(calls, [{ options: { ...expectedOptions, roots: [] }, withdrawingAccountId: undefined }]);
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
		await assert.rejects(ambiguous.sharing.setEnabled(true), /exactly one local GitHub account/);
		const hidden = fixture();
		hidden.disableAI();
		await assert.rejects(hidden.sharing.setEnabled(true), /sharing is unavailable/);
		assert.deepStrictEqual({ ambiguous: ambiguous.calls, hidden: hidden.calls }, { ambiguous: [], hidden: [] });
	}));
});
