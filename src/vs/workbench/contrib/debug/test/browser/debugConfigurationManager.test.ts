/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { ConfigurationManager } from '../../browser/debugConfigurationManager.js';
import { DebugConfigurationProviderTriggerKind, IAdapterManager, IConfig, IDebugAdapterExecutable, IDebugSession } from '../../common/debug.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { TestQuickInputService, TestRemoteAgentService } from '../../../../test/browser/workbenchTestServices.js';
import { TestHistoryService, TestContextService, TestExtensionService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';

suite('debugConfigurationManager', () => {
	const configurationProviderType = 'custom-type';
	let _debugConfigurationManager: ConfigurationManager;
	let disposables: DisposableStore;

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

	const configurationService = new TestConfigurationService();
	let remoteAgentService: IRemoteAgentService;
	setup(() => {
		disposables = new DisposableStore();
		remoteAgentService = new TestRemoteAgentService();
		const fileService = disposables.add(new FileService(new NullLogService()));
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection([IPreferencesService, preferencesService], [IConfigurationService, configurationService], [IRemoteAgentService, remoteAgentService])));
		_debugConfigurationManager = new ConfigurationManager(
			adapterManager,
			new TestContextService(),
			configurationService,
			new TestQuickInputService(),
			instantiationService,
			new TestStorageService(),
			new TestExtensionService(),
			new TestHistoryService(),
			new UriIdentityService(fileService),
			remoteAgentService,
			disposables.add(new ContextKeyService(configurationService)),
			new NullLogService());
	});

	teardown(() => disposables.dispose());

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
		disposables.dispose();
		disposables = new DisposableStore();
		const fileService = disposables.add(new FileService(new NullLogService()));
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection([IPreferencesService, preferencesService], [IConfigurationService, configurationService], [IRemoteAgentService, remoteAgentService])));
		const contextService = new TestContextService();
		configurationService.setUserConfiguration('launch', {
			version: '0.2.0',
			configurations: [
				{ type: 'node', request: 'launch', name: 'visible', presentation: { hidden: false } },
				{ type: 'node', request: 'launch', name: 'linux-hidden', linux: { presentation: { hidden: true } } }
			]
		}, contextService.getWorkspace().folders[0].uri);
		_debugConfigurationManager = new ConfigurationManager(
			adapterManager,
			contextService,
			configurationService,
			new TestQuickInputService(),
			instantiationService,
			new TestStorageService(),
			new TestExtensionService(),
			new TestHistoryService(),
			new UriIdentityService(fileService),
			remoteAgentService,
			disposables.add(new ContextKeyService(configurationService)),
			new NullLogService());

		await Promise.resolve();

		assert.deepStrictEqual(_debugConfigurationManager.getAllConfigurations().map(({ name }) => name), ['visible']);
	});

	teardown(() => disposables.clear());
});
