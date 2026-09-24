/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IPolicyService, NullPolicyService, PolicyValueSource } from '../../../../../platform/policy/common/policy.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { Schemas } from '../../../../../base/common/network.js';
import { UserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../../../../workbench/services/userDataProfile/common/userDataProfileService.js';
import { FileUserDataProvider } from '../../../../../platform/userData/common/fileUserDataProvider.js';
import { TestEnvironmentService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IPolicyData } from '../../../../../base/common/defaultAccount.js';
import { PolicyCategory } from '../../../../../base/common/policy.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ConfigurationService } from '../../browser/configurationService.js';
import { SessionsWorkspaceContextService } from '../../../workspace/browser/workspaceContextService.js';
import { getWorkspaceIdentifier } from '../../../../../platform/workspaces/common/workspaceIdentifier.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IUserDataProfileService } from '../../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { IConfigurationCache } from '../../../../../workbench/services/configuration/common/configuration.js';
import { IDefaultAccountService, MANAGED_SETTINGS_FRESHNESS_NOT_REQUIRED } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { AccountPolicyService } from '../../../../../workbench/services/policies/common/accountPolicyService.js';

const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });

suite('Sessions ConfigurationService', () => {

	let testObject: ConfigurationService;
	let workspaceService: SessionsWorkspaceContextService;
	let fileService: FileService;
	let fileReadsBarrier: Promise<void> | undefined;
	let uriIdentityService: UriIdentityService;
	let userDataProfileService: IUserDataProfileService;
	let workspaceConfigResource: URI;
	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const logService = new NullLogService();
	const nullConfigurationCache: IConfigurationCache = { needsCaching: () => false, read: async () => '', write: async () => { }, remove: async () => { } };

	function createConfigurationService(policyService: IPolicyService): ConfigurationService {
		return disposables.add(new ConfigurationService(userDataProfileService, workspaceService, uriIdentityService, fileService, policyService, logService, nullConfigurationCache, TestEnvironmentService));
	}

	function startAccountPolicyInitialization(policyData: IPolicyData | null) {
		testObject.dispose();
		const onDidChangePolicyData = disposables.add(new Emitter<IPolicyData | null>());
		const defaultAccountService = new class extends mock<IDefaultAccountService>() {
			override policyData = policyData;
			override readonly onDidChangePolicyData = onDidChangePolicyData.event;
			override readonly onDidChangeDefaultAccount = Event.None;
			override readonly onDidChangeManagedSettingsFreshness = Event.None;
			override readonly managedSettingsFreshness = MANAGED_SETTINGS_FRESHNESS_NOT_REQUIRED;
			override async getDefaultAccount() { return null; }
		}();
		const policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService));
		testObject = createConfigurationService(policyService);
		return {
			initialization: testObject.initialize(),
			policyService,
			setPolicyData: (data: IPolicyData | null) => {
				defaultAccountService.policyData = data;
				onDidChangePolicyData.fire(data);
			},
		};
	}

	async function initializeAccountPolicy(policyData: IPolicyData | null) {
		const result = startAccountPolicyInitialization(policyData);
		await result.initialization;
		return result;
	}

	suiteSetup(() => {
		configurationRegistry.registerConfiguration({
			'id': '_test_sessions',
			'type': 'object',
			'properties': {
				'sessionsConfigurationService.testSetting': {
					'type': 'string',
					'default': 'defaultValue',
					scope: ConfigurationScope.RESOURCE
				},
				'sessionsConfigurationService.machineSetting': {
					'type': 'string',
					'default': 'defaultValue',
					scope: ConfigurationScope.MACHINE
				},
				'sessionsConfigurationService.applicationSetting': {
					'type': 'string',
					'default': 'defaultValue',
					scope: ConfigurationScope.APPLICATION
				},
				'sessionsConfigurationService.agentsWindowDefault': {
					'type': 'string',
					'default': 'originalDefault',
					scope: ConfigurationScope.RESOURCE,
					agentsWindow: { default: 'agentsDefault' }
				},
				'sessionsConfigurationService.agentsWindowReadOnly': {
					'type': 'string',
					'default': 'originalDefault',
					scope: ConfigurationScope.RESOURCE,
					agentsWindow: { default: 'readOnlyDefault', readOnly: true }
				},
				'sessionsConfigurationService.agentsWindowDefaultOnly': {
					'type': 'boolean',
					'default': false,
					scope: ConfigurationScope.RESOURCE,
					agentsWindow: { default: true }
				},
				'sessionsConfigurationService.agentsWindowObjectDefault': {
					'type': 'object',
					'default': {},
					scope: ConfigurationScope.RESOURCE,
					agentsWindow: { default: { '*.md': 'vscode.markdown.preview.editor' } }
				},
				'sessionsConfigurationService.agentEnabled': {
					type: 'boolean',
					default: true,
					policy: {
						name: 'SessionsTestAgentMode',
						category: PolicyCategory.InteractiveSession,
						minimumVersion: '1.0.0',
						localization: { description: { key: '', value: '' } },
						value: policyData => policyData.chat_agent_enabled === false ? false : undefined,
					},
				},
				'sessionsConfigurationService.mcpAccess': {
					type: 'string',
					default: 'all',
					policy: {
						name: 'SessionsTestMCP',
						category: PolicyCategory.InteractiveSession,
						minimumVersion: '1.0.0',
						localization: { description: { key: '', value: '' } },
						value: policyData => policyData.mcp === false ? 'none' : undefined,
					},
				},
			}
		});
	});

	setup(async () => {
		fileReadsBarrier = undefined;
		fileService = disposables.add(new class extends FileService {
			override async readFile(...args: Parameters<FileService['readFile']>) {
				await fileReadsBarrier;
				return super.readFile(...args);
			}
		}(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		const environmentService = TestEnvironmentService;
		uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const userDataProfilesService = disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
		disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService))));
		userDataProfileService = disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile));

		const configResource = joinPath(ROOT, 'agent-sessions.code-workspace');
		workspaceConfigResource = configResource;
		await fileService.writeFile(configResource, VSBuffer.fromString(JSON.stringify({ folders: [] })));

		workspaceService = disposables.add(new SessionsWorkspaceContextService(getWorkspaceIdentifier(configResource), uriIdentityService));
		testObject = createConfigurationService(new NullPolicyService());
		await testObject.initialize();
	});

	suite('account policy', () => {
		test('initializes policy definitions after defaults are available', async () => {
			const { policyService } = await initializeAccountPolicy({ chat_agent_enabled: false, mcp: false });

			assert.deepStrictEqual({
				agentEnabled: testObject.getValue('sessionsConfigurationService.agentEnabled'),
				agentPolicy: testObject.inspect('sessionsConfigurationService.agentEnabled').policyValue,
				mcpAccess: testObject.getValue('sessionsConfigurationService.mcpAccess'),
				mcpPolicy: testObject.inspect('sessionsConfigurationService.mcpAccess').policyValue,
				source: policyService.getPolicyValueSource('SessionsTestAgentMode'),
			}, {
				agentEnabled: false,
				agentPolicy: false,
				mcpAccess: 'none',
				mcpPolicy: 'none',
				source: PolicyValueSource.Account,
			});
		});

		test('overrides user and workspace configuration', async () => {
			await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "sessionsConfigurationService.agentEnabled": true }'));
			await fileService.writeFile(workspaceConfigResource, VSBuffer.fromString(JSON.stringify({ folders: [], settings: { 'sessionsConfigurationService.agentEnabled': true } })));
			await initializeAccountPolicy({ chat_agent_enabled: false });

			const inspection = testObject.inspect('sessionsConfigurationService.agentEnabled');
			assert.deepStrictEqual({
				value: inspection.value,
				policy: inspection.policyValue,
				user: inspection.userValue,
				workspace: inspection.workspaceValue,
			}, { value: false, policy: false, user: true, workspace: true });
		});

		test('applies and removes account policy received after initialization', async () => {
			const { setPolicyData } = await initializeAccountPolicy(null);
			const values = [testObject.getValue('sessionsConfigurationService.agentEnabled')];

			const restricted = Event.toPromise(Event.filter(testObject.onDidChangeConfiguration, e => e.affectsConfiguration('sessionsConfigurationService.agentEnabled')));
			setPolicyData({ chat_agent_enabled: false });
			await restricted;
			values.push(testObject.getValue('sessionsConfigurationService.agentEnabled'));

			const unrestricted = Event.toPromise(Event.filter(testObject.onDidChangeConfiguration, e => e.affectsConfiguration('sessionsConfigurationService.agentEnabled')));
			setPolicyData(null);
			await unrestricted;
			values.push(testObject.getValue('sessionsConfigurationService.agentEnabled'));

			assert.deepStrictEqual(values, [true, false, true]);
		});

		for (const agentEnabled of [false, true]) {
			test(`preserves policy changes while configuration files are loading (agent enabled: ${agentEnabled})`, () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
				const reads = new DeferredPromise<void>();
				fileReadsBarrier = reads.p;
				const { initialization, policyService, setPolicyData } = startAccountPolicyInitialization({ chat_agent_enabled: !agentEnabled });
				try {
					await timeout(0);
					const changed = Event.toPromise(Event.filter(policyService.onDidChange, names => names.includes('SessionsTestAgentMode')));
					setPolicyData({ chat_agent_enabled: agentEnabled });
					await changed;
				} finally {
					fileReadsBarrier = undefined;
					await reads.complete();
				}
				await initialization;

				assert.deepStrictEqual({
					value: testObject.getValue('sessionsConfigurationService.agentEnabled'),
					policy: testObject.inspect('sessionsConfigurationService.agentEnabled').policyValue,
				}, { value: agentEnabled, policy: agentEnabled ? undefined : false });
			}));
		}

		test('rejects writes to account-policy-controlled settings', async () => {
			await initializeAccountPolicy({ chat_agent_enabled: false });

			await assert.rejects(
				() => testObject.updateValue('sessionsConfigurationService.agentEnabled', true),
				/configured in system policy/
			);
		});
	});

	// #region Reading

	test('defaults', () => {
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'defaultValue');
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.machineSetting'), 'defaultValue');
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.applicationSetting'), 'defaultValue');
	});

	test('user settings override defaults', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "userValue" }'));
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'userValue');
	}));

	test('workspace settings from workspace configuration file override defaults', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(workspaceConfigResource, VSBuffer.fromString(JSON.stringify({ folders: [], settings: { 'sessionsConfigurationService.testSetting': 'workspaceValue' } })));
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'workspaceValue');
	}));

	test('workspace settings override user settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(workspaceConfigResource, VSBuffer.fromString(JSON.stringify({ folders: [], settings: { 'sessionsConfigurationService.testSetting': 'workspaceValue' } })));
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "userValue" }'));
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'workspaceValue');
	}));

	test('inspect shows workspace value from workspace configuration file', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(workspaceConfigResource, VSBuffer.fromString(JSON.stringify({ folders: [], settings: { 'sessionsConfigurationService.testSetting': 'workspaceValue' } })));
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "userValue" }'));
		await testObject.reloadConfiguration();
		const inspection = testObject.inspect('sessionsConfigurationService.testSetting');
		assert.strictEqual(inspection.workspaceValue, 'workspaceValue');
		assert.strictEqual(inspection.userValue, 'userValue');
	}));

	test('write setting to workspace target persists to workspace configuration file', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('sessionsConfigurationService.testSetting', 'writtenWorkspaceValue', ConfigurationTarget.WORKSPACE);
		const content = (await fileService.readFile(workspaceConfigResource)).value.toString();
		const parsed = JSON.parse(content);
		assert.strictEqual(parsed.settings['sessionsConfigurationService.testSetting'], 'writtenWorkspaceValue');
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'writtenWorkspaceValue');
	}));

	test('write setting to workspace target does not affect user settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('sessionsConfigurationService.testSetting', 'workspaceOnly', ConfigurationTarget.WORKSPACE);
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'workspaceOnly');
		assert.strictEqual(await fileService.exists(userDataProfileService.currentProfile.settingsResource), false);
	}));

	test('agentsWindow.readOnly settings are excluded from workspace configuration', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(workspaceConfigResource, VSBuffer.fromString(JSON.stringify({ folders: [], settings: { 'sessionsConfigurationService.agentsWindowReadOnly': 'workspaceValue' } })));
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.agentsWindowReadOnly'), 'readOnlyDefault');
	}));

	test('workspace folder settings override workspace settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'myFolder');
		await fileService.createFolder(folder);
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "userValue" }'));
		await testObject.reloadConfiguration();
		await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "folderValue" }'));
		await workspaceService.addFolders([{ uri: folder }]);
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderValue');
	}));

	test('folder settings are read when folders are added', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'addedFolder');
		await fileService.createFolder(folder);
		await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "folderValue" }'));
		await workspaceService.addFolders([{ uri: folder }]);
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderValue');
	}));

	test('folder settings are removed when folders are removed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'removedFolder');
		await fileService.createFolder(folder);
		await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "folderValue" }'));
		await workspaceService.addFolders([{ uri: folder }]);
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderValue');
		await workspaceService.removeFolders([folder]);
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'defaultValue');
	}));

	test('configuration change event is fired when folders with settings are removed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'removedFolder2');
		await fileService.createFolder(folder);
		await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "folderValue" }'));
		await workspaceService.addFolders([{ uri: folder }]);
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderValue');

		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await workspaceService.removeFolders([folder]);
		const event = await promise;
		assert.ok(event.affectsConfiguration('sessionsConfigurationService.testSetting'));
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'defaultValue');
	}));

	test('configuration change event is fired on user settings change', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "userValue" }'));
		await testObject.reloadConfiguration();
		const event = await promise;
		assert.ok(event.affectsConfiguration('sessionsConfigurationService.testSetting'));
	}));

	test('inspect returns correct values per layer', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'inspectFolder');
		await fileService.createFolder(folder);
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "userValue" }'));
		await testObject.reloadConfiguration();
		await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "folderValue" }'));
		await workspaceService.addFolders([{ uri: folder }]);

		const inspection = testObject.inspect('sessionsConfigurationService.testSetting', { resource: folder });
		assert.strictEqual(inspection.defaultValue, 'defaultValue');
		assert.strictEqual(inspection.userValue, 'userValue');
		assert.strictEqual(inspection.workspaceFolderValue, 'folderValue');
	}));

	test('application settings are not read from workspace folder', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'appFolder');
		await fileService.createFolder(folder);
		await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.applicationSetting": "folderValue" }'));
		await workspaceService.addFolders([{ uri: folder }]);
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.applicationSetting', { resource: folder }), 'defaultValue');
	}));

	test('machine settings are not read from workspace folder', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'machineFolder');
		await fileService.createFolder(folder);
		await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.machineSetting": "folderValue" }'));
		await workspaceService.addFolders([{ uri: folder }]);
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.machineSetting', { resource: folder }), 'defaultValue');
	}));

	test('folder settings change fires configuration change event', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'changeFolder');
		await fileService.createFolder(folder);
		await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "initialValue" }'));
		await workspaceService.addFolders([{ uri: folder }]);
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'initialValue');

		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "updatedValue" }'));
		const event = await promise;
		assert.ok(event.affectsConfiguration('sessionsConfigurationService.testSetting'));
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'updatedValue');
	}));

	// #endregion

	// #region Writing

	test('updateValue writes to user settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('sessionsConfigurationService.testSetting', 'writtenValue');
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'writtenValue');
	}));

	test('updateValue persists to settings file', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('sessionsConfigurationService.testSetting', 'persistedValue');

		const content = (await fileService.readFile(userDataProfileService.currentProfile.settingsResource)).value.toString();
		assert.ok(content.includes('"sessionsConfigurationService.testSetting"'));
		assert.ok(content.includes('persistedValue'));
	}));

	test('updateValue fires change event', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const promise = Event.toPromise(testObject.onDidChangeConfiguration);
		await testObject.updateValue('sessionsConfigurationService.testSetting', 'eventValue');
		const event = await promise;
		assert.ok(event.affectsConfiguration('sessionsConfigurationService.testSetting'));
	}));

	test('updateValue removes setting when value equals default', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('sessionsConfigurationService.testSetting', 'nonDefault');
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'nonDefault');

		await testObject.updateValue('sessionsConfigurationService.testSetting', 'defaultValue');
		const content = (await fileService.readFile(userDataProfileService.currentProfile.settingsResource)).value.toString();
		assert.ok(!content.includes('sessionsConfigurationService.testSetting'));
	}));

	test('updateValue can update multiple settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('sessionsConfigurationService.testSetting', 'value1');
		await testObject.updateValue('sessionsConfigurationService.machineSetting', 'value2');
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'value1');
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.machineSetting'), 'value2');
	}));

	test('updateValue with language override', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('sessionsConfigurationService.testSetting', 'langValue', { overrideIdentifier: 'jsonc' });
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { overrideIdentifier: 'jsonc' }), 'langValue');
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'defaultValue');
	}));

	test('updateValue is reflected in inspect', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('sessionsConfigurationService.testSetting', 'inspectedValue');
		const inspection = testObject.inspect('sessionsConfigurationService.testSetting');
		assert.strictEqual(inspection.defaultValue, 'defaultValue');
		assert.strictEqual(inspection.userValue, 'inspectedValue');
	}));

	test('updateValue without target writes to workspace when value exists in workspace', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(workspaceConfigResource, VSBuffer.fromString(JSON.stringify({ folders: [], settings: { 'sessionsConfigurationService.testSetting': 'workspaceValue' } })));
		await testObject.reloadConfiguration();

		await testObject.updateValue('sessionsConfigurationService.testSetting', 'updatedValue');

		const content = (await fileService.readFile(workspaceConfigResource)).value.toString();
		const parsed = JSON.parse(content);
		assert.strictEqual(parsed.settings['sessionsConfigurationService.testSetting'], 'updatedValue');
		assert.strictEqual(await fileService.exists(userDataProfileService.currentProfile.settingsResource), false);
	}));

	test('updateValue without target writes to user when value exists in user', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "userValue" }'));
		await testObject.reloadConfiguration();

		await testObject.updateValue('sessionsConfigurationService.testSetting', 'updatedUser');

		const content = (await fileService.readFile(userDataProfileService.currentProfile.settingsResource)).value.toString();
		assert.ok(content.includes('updatedUser'));
	}));

	test('updateValue without target writes to user when no value exists anywhere', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.updateValue('sessionsConfigurationService.testSetting', 'newValue');

		const content = (await fileService.readFile(userDataProfileService.currentProfile.settingsResource)).value.toString();
		assert.ok(content.includes('newValue'));
	}));

	test('updateValue without target removes from all defined targets when setting to default', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(workspaceConfigResource, VSBuffer.fromString(JSON.stringify({ folders: [], settings: { 'sessionsConfigurationService.testSetting': 'workspaceValue' } })));
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "userValue" }'));
		await testObject.reloadConfiguration();

		await testObject.updateValue('sessionsConfigurationService.testSetting', undefined);

		const workspaceContent = (await fileService.readFile(workspaceConfigResource)).value.toString();
		const parsed = JSON.parse(workspaceContent);
		assert.strictEqual(parsed.settings?.['sessionsConfigurationService.testSetting'], undefined);

		const userContent = (await fileService.readFile(userDataProfileService.currentProfile.settingsResource)).value.toString();
		assert.ok(!userContent.includes('sessionsConfigurationService.testSetting'));
	}));

	// #endregion

	// #region Workspace Folder - Read and Write

	test('read setting from workspace folder', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'readFolder');
		await fileService.createFolder(folder);
		await fileService.writeFile(joinPath(folder, '.vscode', 'settings.json'), VSBuffer.fromString('{ "sessionsConfigurationService.testSetting": "folderValue" }'));

		await workspaceService.addFolders([{ uri: folder }]);

		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderValue');
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'defaultValue');
	}));

	test('write setting to workspace folder', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'writeFolder');
		await fileService.createFolder(folder);

		await workspaceService.addFolders([{ uri: folder }]);

		await testObject.updateValue('sessionsConfigurationService.testSetting', 'writtenFolderValue', { resource: folder }, ConfigurationTarget.WORKSPACE_FOLDER);

		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'writtenFolderValue');
	}));

	test('write setting to workspace folder persists to folder settings file', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'persistFolder');
		await fileService.createFolder(folder);

		await workspaceService.addFolders([{ uri: folder }]);

		await testObject.updateValue('sessionsConfigurationService.testSetting', 'persistedFolderValue', { resource: folder }, ConfigurationTarget.WORKSPACE_FOLDER);

		const content = (await fileService.readFile(joinPath(folder, '.vscode', 'settings.json'))).value.toString();
		assert.ok(content.includes('"sessionsConfigurationService.testSetting"'));
		assert.ok(content.includes('persistedFolderValue'));
	}));

	test('write setting to workspace folder does not affect user settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'isolateFolder');
		await fileService.createFolder(folder);

		await workspaceService.addFolders([{ uri: folder }]);

		await testObject.updateValue('sessionsConfigurationService.testSetting', 'folderOnly', { resource: folder }, ConfigurationTarget.WORKSPACE_FOLDER);

		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderOnly');
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'defaultValue');
	}));

	test('workspace folder setting overrides user setting for resource', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'overrideFolder');
		await fileService.createFolder(folder);

		await workspaceService.addFolders([{ uri: folder }]);

		await testObject.updateValue('sessionsConfigurationService.testSetting', 'userValue');
		await testObject.updateValue('sessionsConfigurationService.testSetting', 'folderValue', { resource: folder }, ConfigurationTarget.WORKSPACE_FOLDER);

		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderValue');
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting'), 'userValue');
	}));

	test('inspect shows workspace folder value after write', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'inspectWriteFolder');
		await fileService.createFolder(folder);

		await workspaceService.addFolders([{ uri: folder }]);

		await testObject.updateValue('sessionsConfigurationService.testSetting', 'userVal');
		await testObject.updateValue('sessionsConfigurationService.testSetting', 'folderVal', { resource: folder }, ConfigurationTarget.WORKSPACE_FOLDER);

		const inspection = testObject.inspect('sessionsConfigurationService.testSetting', { resource: folder });
		assert.strictEqual(inspection.defaultValue, 'defaultValue');
		assert.strictEqual(inspection.userValue, 'userVal');
		assert.strictEqual(inspection.workspaceFolderValue, 'folderVal');
	}));

	test('removing folder clears its written settings', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const folder = joinPath(ROOT, 'clearFolder');
		await fileService.createFolder(folder);

		await workspaceService.addFolders([{ uri: folder }]);
		await testObject.updateValue('sessionsConfigurationService.testSetting', 'folderValue', { resource: folder }, ConfigurationTarget.WORKSPACE_FOLDER);
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'folderValue');

		await workspaceService.removeFolders([folder]);
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.testSetting', { resource: folder }), 'defaultValue');
	}));

	// #endregion

	// #region Agents Window Configuration

	test('agentsWindow.default overrides the default value', () => {
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.agentsWindowDefault'), 'agentsDefault');
	});

	test('agentsWindow.default is reflected in inspect', () => {
		const inspection = testObject.inspect('sessionsConfigurationService.agentsWindowDefault');
		assert.strictEqual(inspection.defaultValue, 'agentsDefault');
	});

	test('agentsWindow.default with boolean value', () => {
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.agentsWindowDefaultOnly'), true);
	});

	test('agentsWindow.default with object value', () => {
		assert.deepStrictEqual(testObject.getValue('sessionsConfigurationService.agentsWindowObjectDefault'), { '*.md': 'vscode.markdown.preview.editor' });
	});

	test('agentsWindow.default with object value survives schema re-registration', () => {
		const node = {
			'id': '_test_sessions_object_reregister',
			'type': 'object' as const,
			'properties': {
				'sessionsConfigurationService.agentsWindowObjectDefault': {
					'type': 'object' as const,
					'default': {},
					scope: ConfigurationScope.RESOURCE,
					agentsWindow: { default: { '*.md': 'vscode.markdown.preview.editor' } }
				},
			}
		};
		configurationRegistry.updateConfigurations({ add: [node], remove: [node] });
		assert.deepStrictEqual(testObject.getValue('sessionsConfigurationService.agentsWindowObjectDefault'), { '*.md': 'vscode.markdown.preview.editor' });
	});

	test('agentsWindow.readOnly setting uses overridden default', () => {
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.agentsWindowReadOnly'), 'readOnlyDefault');
	});

	test('agentsWindow.readOnly setting rejects writes', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await assert.rejects(
			() => testObject.updateValue('sessionsConfigurationService.agentsWindowReadOnly', 'newValue'),
			/read-only in the Agents window/
		);
	}));

	test('agentsWindow.readOnly setting ignores user settings file values', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "sessionsConfigurationService.agentsWindowReadOnly": "userValue" }'));
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.agentsWindowReadOnly'), 'readOnlyDefault');
	}));

	test('user settings override agentsWindow.default when not readOnly', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await fileService.writeFile(userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString('{ "sessionsConfigurationService.agentsWindowDefault": "userValue" }'));
		await testObject.reloadConfiguration();
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.agentsWindowDefault'), 'userValue');
	}));

	test('agentsWindow.readOnly setting added dynamically is picked up', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		configurationRegistry.registerConfiguration({
			'id': '_test_sessions_dynamic',
			'type': 'object',
			'properties': {
				'sessionsConfigurationService.dynamicReadOnly': {
					'type': 'string',
					'default': 'originalDefault',
					scope: ConfigurationScope.RESOURCE,
					agentsWindow: { default: 'dynamicDefault', readOnly: true }
				},
			}
		});
		assert.strictEqual(testObject.getValue('sessionsConfigurationService.dynamicReadOnly'), 'dynamicDefault');
		await assert.rejects(
			() => testObject.updateValue('sessionsConfigurationService.dynamicReadOnly', 'newValue'),
			/read-only in the Agents window/
		);
	}));

	// #endregion
});
