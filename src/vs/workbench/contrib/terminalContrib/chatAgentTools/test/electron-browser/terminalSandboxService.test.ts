/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, ok, deepStrictEqual } from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TerminalSandboxService } from '../../common/terminalSandboxService.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';

suite('TerminalSandboxService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let fileService: IFileService;
	let sandboxService: TerminalSandboxService;
	const tmpDir = URI.file('/tmp/vscode-test');

	function setConfig(key: string, value: unknown) {
		configurationService.setUserConfiguration(key, value);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: (k: string) => k === key,
			affectedKeys: new Set([key]),
			source: ConfigurationTarget.USER,
			change: null!,
		});
	}

	setup(() => {
		configurationService = new TestConfigurationService();
		const logService = new NullLogService();
		fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));

		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
			fileService: () => fileService,
		}, store);

		// Mock environment service with tmpDir
		instantiationService.stub(IEnvironmentService, <Partial<IEnvironmentService & { tmpDir: URI }>>({
			tmpDir
		}));

		// Mock remote agent service to return non-Windows OS
		instantiationService.stub(IRemoteAgentService, <Partial<IRemoteAgentService>>{
			getEnvironment: async () => ({ os: OperatingSystem.Linux })
		});

		// Enable sandbox by default
		setConfig(TerminalChatAgentToolsSettingId.TerminalSandboxEnabled, true);
	});

	suite('isEnabled', () => {
		test('should return true when sandbox is enabled and OS is not Windows', () => {
			sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
			strictEqual(sandboxService.isEnabled(), true);
		});

		test('should return false when sandbox is disabled', () => {
			setConfig(TerminalChatAgentToolsSettingId.TerminalSandboxEnabled, false);
			sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
			strictEqual(sandboxService.isEnabled(), false);
		});

		test('should return false on Windows regardless of setting', async () => {
			instantiationService.stub(IRemoteAgentService, <Partial<IRemoteAgentService>>{
				getEnvironment: async () => ({ os: OperatingSystem.Windows })
			});
			sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
			// Wait for the OS to be set from remote agent
			await new Promise(resolve => setTimeout(resolve, 10));
			strictEqual(sandboxService.isEnabled(), false);
		});
	});

	suite('wrapCommand', () => {
		test('should throw error when sandbox config path is not initialized', async () => {
			sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));

			let threw = false;
			try {
				sandboxService.wrapCommand('echo hello');
			} catch (e) {
				threw = true;
				ok((e as Error).message.includes('not initialized'));
			}
			strictEqual(threw, true, 'Expected wrapCommand to throw when not initialized');
		});

		test('should wrap command with srt path and settings', async () => {
			sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
			await sandboxService.getSandboxConfigPath();

			const wrappedCommand = sandboxService.wrapCommand('echo hello');

			ok(wrappedCommand.includes('sandbox-runtime'), 'Wrapped command should include sandbox runtime CLI');
			ok(wrappedCommand.includes('TMPDIR='), 'Wrapped command should include TMPDIR');
			ok(wrappedCommand.includes('--settings'), 'Wrapped command should include --settings flag');
			ok(wrappedCommand.includes('"echo hello"'), 'Wrapped command should include the original command in quotes');
		});
	});

	suite('getTempDir', () => {
		test('should return temp directory when sandbox is enabled', () => {
			sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
			const tempDir = sandboxService.getTempDir();
			deepStrictEqual(tempDir, tmpDir);
		});

		test('should return undefined when sandbox is disabled', () => {
			setConfig(TerminalChatAgentToolsSettingId.TerminalSandboxEnabled, false);
			sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
			strictEqual(sandboxService.getTempDir(), undefined);
		});
	});

	suite('getSandboxConfigPath', () => {
		test('should create sandbox config file with network settings', async () => {
			setConfig(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
				allowedDomains: ['example.com'],
				deniedDomains: ['blocked.com']
			});

			sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
			const configPath = await sandboxService.getSandboxConfigPath();

			ok(configPath, 'Config path should be defined');
			ok(configPath!.includes('vscode-sandbox-settings'), 'Config path should contain vscode-sandbox-settings');

			// Verify the file was created with correct content
			const configUri = URI.file(configPath!);
			const content = await fileService.readFile(configUri);
			const settings = JSON.parse(content.value.toString());

			deepStrictEqual(settings.network.allowedDomains, ['example.com']);
			deepStrictEqual(settings.network.deniedDomains, ['blocked.com']);
		});

		test('should create sandbox config file with Linux filesystem settings', async () => {
			setConfig(TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem, {
				denyRead: ['/etc/shadow'],
				allowWrite: ['/tmp'],
				denyWrite: ['/etc']
			});

			sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
			const configPath = await sandboxService.getSandboxConfigPath();

			ok(configPath, 'Config path should be defined');

			const configUri = URI.file(configPath!);
			const content = await fileService.readFile(configUri);
			const settings = JSON.parse(content.value.toString());

			deepStrictEqual(settings.filesystem.denyRead, ['/etc/shadow']);
			deepStrictEqual(settings.filesystem.allowWrite, ['/tmp']);
			deepStrictEqual(settings.filesystem.denyWrite, ['/etc']);
		});

		test('should return cached config path on subsequent calls', async () => {
			sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));

			const configPath1 = await sandboxService.getSandboxConfigPath();
			const configPath2 = await sandboxService.getSandboxConfigPath();

			strictEqual(configPath1, configPath2, 'Config path should be cached');
		});

		test('should refresh config when forceRefresh is true', async () => {
			sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));

			const configPath1 = await sandboxService.getSandboxConfigPath();

			// Change network settings
			setConfig(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
				allowedDomains: ['newdomain.com'],
				deniedDomains: []
			});

			const configPath2 = await sandboxService.getSandboxConfigPath(true);

			// Path should be the same (same session)
			strictEqual(configPath1, configPath2);

			// But content should be updated
			const configUri = URI.file(configPath2!);
			const content = await fileService.readFile(configUri);
			const settings = JSON.parse(content.value.toString());

			deepStrictEqual(settings.network.allowedDomains, ['newdomain.com']);
		});

		test('should return undefined when sandbox is disabled', async () => {
			setConfig(TerminalChatAgentToolsSettingId.TerminalSandboxEnabled, false);
			sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));

			const configPath = await sandboxService.getSandboxConfigPath();
			strictEqual(configPath, undefined);
		});
	});

	suite('setNeedsForceUpdateConfigFile', () => {
		test('should force config file update on next getSandboxConfigPath call', async () => {
			sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));

			// First call to initialize
			await sandboxService.getSandboxConfigPath();

			// Change settings
			setConfig(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
				allowedDomains: ['updated.com'],
				deniedDomains: []
			});

			// Mark as needing update
			sandboxService.setNeedsForceUpdateConfigFile();

			// Get config path (should update)
			const configPath = await sandboxService.getSandboxConfigPath();
			ok(configPath, 'Config path should be defined');

			const configUri = URI.file(configPath!);
			const content = await fileService.readFile(configUri);
			const settings = JSON.parse(content.value.toString());

			deepStrictEqual(settings.network.allowedDomains, ['updated.com']);
		});
	});

	suite('Mac filesystem settings', () => {
		test('should use Mac filesystem settings on macOS', async () => {
			instantiationService.stub(IRemoteAgentService, <Partial<IRemoteAgentService>>{
				getEnvironment: async () => ({ os: OperatingSystem.Macintosh })
			});

			setConfig(TerminalChatAgentToolsSettingId.TerminalSandboxMacFileSystem, {
				denyRead: ['/Library/Keychains'],
				allowWrite: ['/tmp'],
				denyWrite: ['/System']
			});

			sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
			// Wait for OS detection
			await new Promise(resolve => setTimeout(resolve, 10));

			const configPath = await sandboxService.getSandboxConfigPath();
			ok(configPath, 'Config path should be defined');

			const configUri = URI.file(configPath!);
			const content = await fileService.readFile(configUri);
			const settings = JSON.parse(content.value.toString());

			deepStrictEqual(settings.filesystem.denyRead, ['/Library/Keychains']);
			deepStrictEqual(settings.filesystem.allowWrite, ['/tmp']);
			deepStrictEqual(settings.filesystem.denyWrite, ['/System']);
		});
	});
});
