/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { OperatingSystem, OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, ConfigurationTargetToString, IConfigurationOverrides, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { Workspace, testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { ConfigurationManager } from '../../browser/debugConfigurationManager.js';
import { DebugConfigurationProviderTriggerKind, IAdapterManager, IConfig, IDebugAdapterExecutable, IDebugSession } from '../../common/debug.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { ITestInstantiationService, TestRemoteAgentService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';

suite('debugConfigurationManager', () => {
	const configurationProviderType = 'custom-type';
	let _debugConfigurationManager: ConfigurationManager;
	let disposables: DisposableStore;
	let instantiationService: ITestInstantiationService;
	let contextService: TestContextService;

	const adapterManager = <IAdapterManager>{
		getDebugAdapterDescriptor(session: IDebugSession, config: IConfig): Promise<IDebugAdapterExecutable | undefined> {
			return Promise.resolve(undefined);
		},

		activateDebuggers(activationEvent: string, debugType?: string): Promise<void> {
			return Promise.resolve();
		},

		get onDidDebuggersExtPointRead(): Event<void> {
			return Event.None;
		}
	};

	const preferencesService = <IPreferencesService>{
		userSettingsResource: URI.file('/tmp/settings.json')
	};

	let configurationService: TestConfigurationService;
	let remoteAgentService: IRemoteAgentService;

	function createConfigurationManager(): ConfigurationManager {
		instantiationService.stub(IWorkspaceContextService, contextService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		instantiationService.stub(IPreferencesService, preferencesService);
		return disposables.add(instantiationService.createInstance(ConfigurationManager, adapterManager));
	}

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = workbenchInstantiationService(undefined, disposables);
		contextService = new TestContextService();
		configurationService = new TestConfigurationService();
		remoteAgentService = new TestRemoteAgentService();
		_debugConfigurationManager = createConfigurationManager();
	});

	teardown(() => {
		sinon.restore();
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves configuration based on type', async () => {
		disposables.add(_debugConfigurationManager.registerDebugConfigurationProvider({
			type: configurationProviderType,
			resolveDebugConfiguration: (folderUri, config, token) => {
				assert.strictEqual(config.type, configurationProviderType);
				return Promise.resolve({
					...config,
					configurationResolved: true
				});
			},
			triggerKind: DebugConfigurationProviderTriggerKind.Initial
		}));

		const initialConfig: IConfig = {
			type: configurationProviderType,
			request: 'launch',
			name: 'configName',
		};

		const resultConfig = await _debugConfigurationManager.resolveConfigurationByProviders(undefined, configurationProviderType, initialConfig, CancellationToken.None);
		// eslint-disable-next-line local/code-no-any-casts
		assert.strictEqual((resultConfig as any).configurationResolved, true, 'Configuration should be updated by test provider');
	});

	test('resolves configuration from second provider if type changes', async () => {
		const secondProviderType = 'second-provider';
		disposables.add(_debugConfigurationManager.registerDebugConfigurationProvider({
			type: configurationProviderType,
			resolveDebugConfiguration: (folderUri, config, token) => {
				assert.strictEqual(config.type, configurationProviderType);
				return Promise.resolve({
					...config,
					type: secondProviderType
				});
			},
			triggerKind: DebugConfigurationProviderTriggerKind.Initial
		}));
		disposables.add(_debugConfigurationManager.registerDebugConfigurationProvider({
			type: secondProviderType,
			resolveDebugConfiguration: (folderUri, config, token) => {
				assert.strictEqual(config.type, secondProviderType);
				return Promise.resolve({
					...config,
					configurationResolved: true
				});
			},
			triggerKind: DebugConfigurationProviderTriggerKind.Initial
		}));

		const initialConfig: IConfig = {
			type: configurationProviderType,
			request: 'launch',
			name: 'configName',
		};

		const resultConfig = await _debugConfigurationManager.resolveConfigurationByProviders(undefined, configurationProviderType, initialConfig, CancellationToken.None);
		assert.strictEqual(resultConfig!.type, secondProviderType);
		// eslint-disable-next-line local/code-no-any-casts
		assert.strictEqual((resultConfig as any).configurationResolved, true, 'Configuration should be updated by test provider');
	});

	test('uses remote target OS when computing visible configurations', async () => {
		class LinuxRemoteAgentService extends TestRemoteAgentService {
			override async getEnvironment(): Promise<IRemoteAgentEnvironment> {
				return {
					pid: 1,
					connectionToken: 'token',
					appRoot: URI.file('/remote/app'),
					execPath: '/remote/app/node',
					tmpDir: URI.file('/remote/tmp'),
					settingsPath: URI.file('/remote/settings.json'),
					mcpResource: URI.file('/remote/mcp.json'),
					logsPath: URI.file('/remote/logs'),
					extensionHostLogsPath: URI.file('/remote/ext-logs'),
					globalStorageHome: URI.file('/remote/global-storage'),
					workspaceStorageHome: URI.file('/remote/workspace-storage'),
					localHistoryHome: URI.file('/remote/local-history'),
					userHome: URI.file('/remote/home'),
					os: OperatingSystem.Linux,
					arch: 'x64',
					marks: [],
					useHostProxy: false,
					profiles: {
						all: [],
						home: URI.file('/remote/profiles')
					},
					isUnsupportedGlibc: false
				};
			}
		}

		remoteAgentService = new LinuxRemoteAgentService();
		contextService = new TestContextService();
		configurationService.setUserConfiguration('launch', {
			version: '0.2.0',
			configurations: [
				{ type: 'node', request: 'launch', name: 'visible', presentation: { hidden: false } },
				{ type: 'node', request: 'launch', name: 'linux-hidden', linux: { presentation: { hidden: true } } }
			]
		});
		disposables.delete(_debugConfigurationManager);
		_debugConfigurationManager = createConfigurationManager();

		if (OS !== OperatingSystem.Linux) {
			await Event.toPromise(_debugConfigurationManager.onDidSelectConfiguration);
		}

		assert.deepStrictEqual(_debugConfigurationManager.getAllConfigurations().map(({ name }) => name), ['visible']);
	});

	test('ignores null entries in launch configurations', () => {
		configurationService.setUserConfiguration('launch', {
			version: '0.2.0',
			configurations: [
				{ type: 'node', request: 'launch', name: 'valid' },
				null
			]
		});

		disposables.delete(_debugConfigurationManager);
		_debugConfigurationManager = createConfigurationManager();

		assert.deepStrictEqual(_debugConfigurationManager.getAllConfigurations().map(({ name }) => name), ['valid']);
	});

	suite('configuration selection', () => {
		const folderUri = URI.file('/project');
		const workspaceUri = URI.file('/repro.code-workspace');

		setup(async () => {
			disposables.delete(_debugConfigurationManager);
			contextService.setWorkspace(new Workspace('repro', testWorkspace(folderUri, URI.file('/other')).folders, workspaceUri));
			await configurationService.setUserConfiguration('launch', {
				configurations: [{ name: 'User', type: 'node', request: 'launch', program: 'user.js' }]
			});
			await configurationService.setUserConfiguration('folderLaunch', {
				configurations: [{ name: 'A', type: 'node', request: 'launch' }]
			});
			await configurationService.setUserConfiguration('workspaceLaunch', {
				configurations: [{ name: 'Workspace', type: 'node', request: 'launch', program: 'workspace.js' }]
			});
			sinon.stub(configurationService, 'inspect').callsFake(<T>(key: string, overrides?: IConfigurationOverrides) => {
				const folder = overrides?.resource ? contextService.getWorkspaceFolder(overrides.resource) : undefined;
				return {
					userValue: configurationService.getValue<T>(key),
					workspaceValue: configurationService.getValue<T>('workspaceLaunch'),
					workspaceFolderValue: folder?.uri.toString() === folderUri.toString() ? configurationService.getValue<T>('folderLaunch') : undefined
				};
			});
			_debugConfigurationManager = createConfigurationManager();
		});

		function fireLaunchChange(source: ConfigurationTarget): void {
			configurationService.onDidChangeConfigurationEmitter.fire({
				source,
				affectedKeys: new Set(['launch']),
				change: { keys: ['launch'], overrides: [] },
				affectsConfiguration: section => section === 'launch'
			});
		}

		for (const { scope, name, key, target } of [
			{ scope: 'user', name: 'User', key: 'launch', target: ConfigurationTarget.USER },
			{ scope: 'workspace', name: 'Workspace', key: 'workspaceLaunch', target: ConfigurationTarget.WORKSPACE }
		]) {
			function getLaunch() {
				const resource = scope === 'user' ? preferencesService.userSettingsResource : workspaceUri;
				return _debugConfigurationManager.getLaunches().find(launch => launch.uri.toString() === resource.toString())!;
			}

			for (const source of [ConfigurationTarget.USER, ConfigurationTarget.WORKSPACE, ConfigurationTarget.WORKSPACE_FOLDER]) {
				test(`keeps the ${scope} configuration selected after a ${ConfigurationTargetToString(source)} launch change`, async () => {
					const launch = getLaunch();
					await _debugConfigurationManager.selectConfiguration(launch, name);
					const changedKey = source === ConfigurationTarget.USER ? 'launch' : source === ConfigurationTarget.WORKSPACE ? 'workspaceLaunch' : 'folderLaunch';
					const updated = configurationService.getValue<{ configurations: (IConfig & { program?: string })[] }>(changedKey)!;
					updated.configurations[0].program = 'updated.js';
					await configurationService.setUserConfiguration(changedKey, updated);

					fireLaunchChange(source);

					assert.deepStrictEqual({
						uri: _debugConfigurationManager.selectedConfiguration.launch?.uri.toString(),
						name: _debugConfigurationManager.selectedConfiguration.name,
						config: await _debugConfigurationManager.selectedConfiguration.getConfig()
					}, {
						uri: launch.uri.toString(),
						name,
						config: { name, type: 'node', request: 'launch', program: changedKey === key ? 'updated.js' : `${scope}.js`, __configurationTarget: target }
					});
				});
			}

			test(`restores the ${scope} configuration after recreating the manager`, async () => {
				const launch = getLaunch();
				await _debugConfigurationManager.selectConfiguration(launch, name);
				disposables.delete(_debugConfigurationManager);
				_debugConfigurationManager = createConfigurationManager();

				assert.deepStrictEqual({
					uri: _debugConfigurationManager.selectedConfiguration.launch?.uri.toString(),
					name: _debugConfigurationManager.selectedConfiguration.name
				}, { uri: launch.uri.toString(), name });
			});

			test(`falls back to the folder when the selected ${scope} launch becomes empty`, async () => {
				await _debugConfigurationManager.selectConfiguration(getLaunch(), name);
				await configurationService.setUserConfiguration(key, { configurations: [] });

				fireLaunchChange(target);

				assert.deepStrictEqual({
					workspace: _debugConfigurationManager.selectedConfiguration.launch?.workspace?.uri.toString(),
					name: _debugConfigurationManager.selectedConfiguration.name
				}, { workspace: folderUri.toString(), name: 'A' });
			});
		}
	});

	teardown(() => disposables.clear());
});
