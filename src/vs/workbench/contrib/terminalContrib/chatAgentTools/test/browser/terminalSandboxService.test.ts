/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, ok } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TerminalSandboxService } from '../../common/terminalSandboxService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
import { ITrustedDomainService } from '../../../../url/common/trustedDomainService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { Event, Emitter } from '../../../../../../base/common/event.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { IRemoteAgentEnvironment } from '../../../../../../platform/remote/common/remoteAgentEnvironment.js';

suite('TerminalSandboxService - allowTrustedDomains', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let trustedDomainService: MockTrustedDomainService;
	let fileService: MockFileService;
	let createdFiles: Map<string, string>;

	class MockTrustedDomainService implements ITrustedDomainService {
		_serviceBrand: undefined;
		private _onDidChangeTrustedDomains = new Emitter<void>();
		readonly onDidChangeTrustedDomains: Event<void> = this._onDidChangeTrustedDomains.event;
		trustedDomains: string[] = [];
		isValid(_resource: URI): boolean {
			return true;
		}
	}

	class MockFileService {
		async createFile(uri: URI, content: VSBuffer): Promise<any> {
			const contentString = content.toString();
			createdFiles.set(uri.path, contentString);
			return {};
		}
	}

	class MockRemoteAgentService {
		async getEnvironment(): Promise<IRemoteAgentEnvironment> {
			// Return a Linux environment to ensure tests pass on Windows
			// (sandbox is not supported on Windows)
			return {
				os: OperatingSystem.Linux,
				tmpDir: URI.file('/tmp'),
				appRoot: URI.file('/app'),
				pid: 1234,
				connectionToken: 'test-token',
				settingsPath: URI.file('/settings'),
				mcpResource: URI.file('/mcp'),
				logsPath: URI.file('/logs'),
				extensionHostLogsPath: URI.file('/ext-logs'),
				globalStorageHome: URI.file('/global'),
				workspaceStorageHome: URI.file('/workspace'),
				localHistoryHome: URI.file('/history'),
				userHome: URI.file('/home/user'),
				arch: 'x64',
				marks: [],
				useHostProxy: false,
				profiles: {
					all: [],
					home: URI.file('/profiles')
				},
				isUnsupportedGlibc: false
			};
		}
	}

	setup(() => {
		createdFiles = new Map();
		instantiationService = workbenchInstantiationService({}, store);
		configurationService = new TestConfigurationService();
		trustedDomainService = new MockTrustedDomainService();
		fileService = new MockFileService();

		// Setup default configuration
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxEnabled, true);
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: [],
			deniedDomains: [],
			allowTrustedDomains: false
		});

		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IEnvironmentService, <IEnvironmentService & { tmpDir?: URI; execPath?: string }>{
			_serviceBrand: undefined,
			tmpDir: URI.file('/tmp'),
			execPath: '/usr/bin/node'
		});
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IRemoteAgentService, new MockRemoteAgentService());
		instantiationService.stub(ITrustedDomainService, trustedDomainService);
	});

	test('should filter out sole wildcard (*) from trusted domains', async () => {
		// Setup: Enable allowTrustedDomains and add * to trusted domains
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: [],
			deniedDomains: [],
			allowTrustedDomains: true
		});
		trustedDomainService.trustedDomains = ['*'];

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const configContent = createdFiles.get(configPath);
		ok(configContent, 'Config file should be created');

		const config = JSON.parse(configContent);
		strictEqual(config.network.allowedDomains.length, 0, 'Sole wildcard * should be filtered out');
	});

	test('should allow wildcards with domains like *.github.com', async () => {
		// Setup: Enable allowTrustedDomains and add *.github.com
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: [],
			deniedDomains: [],
			allowTrustedDomains: true
		});
		trustedDomainService.trustedDomains = ['*.github.com'];

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const configContent = createdFiles.get(configPath);
		ok(configContent, 'Config file should be created');

		const config = JSON.parse(configContent);
		strictEqual(config.network.allowedDomains.length, 1, 'Wildcard domain should be included');
		strictEqual(config.network.allowedDomains[0], '*.github.com', 'Wildcard domain should match');
	});

	test('should combine trusted domains with configured allowedDomains, filtering out *', async () => {
		// Setup: Enable allowTrustedDomains with multiple domains including *
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: ['example.com'],
			deniedDomains: [],
			allowTrustedDomains: true
		});
		trustedDomainService.trustedDomains = ['*', '*.github.com', 'microsoft.com'];

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const configContent = createdFiles.get(configPath);
		ok(configContent, 'Config file should be created');

		const config = JSON.parse(configContent);
		strictEqual(config.network.allowedDomains.length, 3, 'Should have 3 domains (excluding *)');
		ok(config.network.allowedDomains.includes('example.com'), 'Should include configured domain');
		ok(config.network.allowedDomains.includes('*.github.com'), 'Should include wildcard domain');
		ok(config.network.allowedDomains.includes('microsoft.com'), 'Should include microsoft.com');
		ok(!config.network.allowedDomains.includes('*'), 'Should not include sole wildcard');
	});

	test('should not include trusted domains when allowTrustedDomains is false', async () => {
		// Setup: Disable allowTrustedDomains
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: ['example.com'],
			deniedDomains: [],
			allowTrustedDomains: false
		});
		trustedDomainService.trustedDomains = ['*', '*.github.com'];

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const configContent = createdFiles.get(configPath);
		ok(configContent, 'Config file should be created');

		const config = JSON.parse(configContent);
		strictEqual(config.network.allowedDomains.length, 1, 'Should only have configured domain');
		strictEqual(config.network.allowedDomains[0], 'example.com', 'Should only include example.com');
	});

	test('should deduplicate domains when combining sources', async () => {
		// Setup: Same domain in both sources
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: ['github.com', '*.github.com'],
			deniedDomains: [],
			allowTrustedDomains: true
		});
		trustedDomainService.trustedDomains = ['*.github.com', 'github.com'];

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const configContent = createdFiles.get(configPath);
		ok(configContent, 'Config file should be created');

		const config = JSON.parse(configContent);
		strictEqual(config.network.allowedDomains.length, 2, 'Should have 2 unique domains');
		ok(config.network.allowedDomains.includes('github.com'), 'Should include github.com');
		ok(config.network.allowedDomains.includes('*.github.com'), 'Should include *.github.com');
	});

	test('should handle empty trusted domains list', async () => {
		// Setup: Empty trusted domains
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: ['example.com'],
			deniedDomains: [],
			allowTrustedDomains: true
		});
		trustedDomainService.trustedDomains = [];

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const configContent = createdFiles.get(configPath);
		ok(configContent, 'Config file should be created');

		const config = JSON.parse(configContent);
		strictEqual(config.network.allowedDomains.length, 1, 'Should have only configured domain');
		strictEqual(config.network.allowedDomains[0], 'example.com', 'Should only include example.com');
	});

	test('should handle only * in trusted domains', async () => {
		// Setup: Only * in trusted domains (edge case)
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: [],
			deniedDomains: [],
			allowTrustedDomains: true
		});
		trustedDomainService.trustedDomains = ['*'];

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const configContent = createdFiles.get(configPath);
		ok(configContent, 'Config file should be created');

		const config = JSON.parse(configContent);
		strictEqual(config.network.allowedDomains.length, 0, 'Should have no domains (* filtered out)');
	});
});
