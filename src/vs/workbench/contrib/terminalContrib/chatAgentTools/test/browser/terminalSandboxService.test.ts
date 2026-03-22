/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, ok } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestLifecycleService, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestProductService } from '../../../../../test/common/workbenchTestServices.js';
import { TerminalSandboxService } from '../../common/terminalSandboxService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
import { ITrustedDomainService } from '../../../../url/common/trustedDomainService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { Event, Emitter } from '../../../../../../base/common/event.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { IRemoteAgentEnvironment } from '../../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';

suite('TerminalSandboxService - allowTrustedDomains', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let trustedDomainService: MockTrustedDomainService;
	let fileService: MockFileService;
	let lifecycleService: TestLifecycleService;
	let workspaceContextService: MockWorkspaceContextService;
	let productService: IProductService;
	let createdFiles: Map<string, string>;
	let createdFolders: string[];
	let deletedFolders: string[];
	const windowId = 7;

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

		async createFolder(uri: URI): Promise<any> {
			createdFolders.push(uri.path);
			return {};
		}

		async del(uri: URI): Promise<void> {
			deletedFolders.push(uri.path);
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
				execPath: '/app/node',
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

	class MockWorkspaceContextService implements IWorkspaceContextService {
		_serviceBrand: undefined;
		readonly onDidChangeWorkbenchState = Event.None;
		readonly onDidChangeWorkspaceName = Event.None;
		readonly onWillChangeWorkspaceFolders = Event.None;
		private readonly _onDidChangeWorkspaceFolders = new Emitter<IWorkspaceFoldersChangeEvent>();
		readonly onDidChangeWorkspaceFolders: Event<IWorkspaceFoldersChangeEvent> = this._onDidChangeWorkspaceFolders.event;
		private _workspace: IWorkspace = testWorkspace();

		getCompleteWorkspace(): Promise<IWorkspace> {
			return Promise.resolve(this._workspace);
		}

		getWorkspace(): IWorkspace {
			return this._workspace;
		}

		getWorkbenchState(): WorkbenchState {
			return this._workspace.folders.length > 0 ? WorkbenchState.FOLDER : WorkbenchState.EMPTY;
		}

		getWorkspaceFolder(_resource: URI): IWorkspaceFolder | null {
			return null;
		}

		isCurrentWorkspace(_workspaceIdOrFolder: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI): boolean {
			return false;
		}

		isInsideWorkspace(_resource: URI): boolean {
			return false;
		}

		hasWorkspaceData(): boolean {
			return this._workspace.folders.length > 0;
		}

		setWorkspaceFolders(folders: URI[]): void {
			const previousFolders = this._workspace.folders;
			this._workspace = testWorkspace(...folders);
			this._onDidChangeWorkspaceFolders.fire({
				added: this._workspace.folders.filter(folder => !previousFolders.some(previousFolder => previousFolder.uri.toString() === folder.uri.toString())),
				removed: previousFolders.filter(folder => !this._workspace.folders.some(nextFolder => nextFolder.uri.toString() === folder.uri.toString())),
				changed: []
			});
		}
	}

	setup(() => {
		createdFiles = new Map();
		createdFolders = [];
		deletedFolders = [];
		instantiationService = workbenchInstantiationService({}, store);
		configurationService = new TestConfigurationService();
		trustedDomainService = new MockTrustedDomainService();
		fileService = new MockFileService();
		lifecycleService = store.add(new TestLifecycleService());
		workspaceContextService = new MockWorkspaceContextService();
		productService = {
			...TestProductService,
			dataFolderName: '.test-data',
			serverDataFolderName: '.test-server-data'
		};
		workspaceContextService.setWorkspaceFolders([URI.file('/workspace-one')]);

		// Setup default configuration
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxEnabled, true);
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: [],
			deniedDomains: [],
			allowTrustedDomains: false
		});

		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IEnvironmentService, <IEnvironmentService & { tmpDir?: URI; execPath?: string; window?: { id: number } }>{
			_serviceBrand: undefined,
			tmpDir: URI.file('/tmp'),
			execPath: '/usr/bin/node',
			window: { id: windowId }
		});
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IProductService, productService);
		instantiationService.stub(IRemoteAgentService, new MockRemoteAgentService());
		instantiationService.stub(ITrustedDomainService, trustedDomainService);
		instantiationService.stub(IWorkspaceContextService, workspaceContextService);
		instantiationService.stub(ILifecycleService, lifecycleService);
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

	test('should refresh allowWrite paths when workspace folders change', async () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem, {
			allowWrite: ['/configured/path'],
			denyRead: [],
			denyWrite: []
		});

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const initialConfigContent = createdFiles.get(configPath);
		ok(initialConfigContent, 'Config file should be created for the initial workspace folders');

		const initialConfig = JSON.parse(initialConfigContent);
		ok(initialConfig.filesystem.allowWrite.includes('/workspace-one'), 'Initial config should include the original workspace folder');
		ok(initialConfig.filesystem.allowWrite.includes('/configured/path'), 'Initial config should include configured allowWrite paths');

		workspaceContextService.setWorkspaceFolders([URI.file('/workspace-two')]);

		const refreshedConfigPath = await sandboxService.getSandboxConfigPath();
		strictEqual(refreshedConfigPath, configPath, 'Config path should stay stable when the config is refreshed');

		const refreshedConfigContent = createdFiles.get(configPath);
		ok(refreshedConfigContent, 'Config file should be rewritten after workspace folders change');

		const refreshedConfig = JSON.parse(refreshedConfigContent);
		ok(refreshedConfig.filesystem.allowWrite.includes('/workspace-two'), 'Refreshed config should include the updated workspace folder');
		ok(!refreshedConfig.filesystem.allowWrite.includes('/workspace-one'), 'Refreshed config should remove the old workspace folder');
		ok(refreshedConfig.filesystem.allowWrite.includes('/configured/path'), 'Refreshed config should preserve configured allowWrite paths');
	});

	test('should create sandbox temp dir under the server data folder', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();
		const expectedTempDir = URI.joinPath(URI.file('/home/user'), productService.serverDataFolderName ?? productService.dataFolderName, 'tmp', `tmp_vscode_${windowId}`);

		strictEqual(sandboxService.getTempDir()?.path, expectedTempDir.path, 'Sandbox temp dir should live under the server data folder');
		strictEqual(createdFolders[0], expectedTempDir.path, 'Sandbox temp dir should be created before writing the config');
		ok(configPath?.startsWith(expectedTempDir.path), 'Sandbox config file should be written inside the sandbox temp dir');
	});

	test('should delete sandbox temp dir on shutdown', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();
		const expectedTempDir = URI.joinPath(URI.file('/home/user'), productService.serverDataFolderName ?? productService.dataFolderName, 'tmp', `tmp_vscode_${windowId}`);

		lifecycleService.fireShutdown();
		await Promise.all(lifecycleService.shutdownJoiners);

		strictEqual(lifecycleService.shutdownJoiners.length, 1, 'Shutdown should register a temp-dir cleanup joiner');
		strictEqual(deletedFolders[0], expectedTempDir.path, 'Shutdown should delete the sandbox temp dir');
	});

	test('should add ripgrep bin directory to PATH when wrapping command', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrappedCommand = sandboxService.wrapCommand('echo test');

		ok(
			wrappedCommand.includes('PATH') && wrappedCommand.includes('ripgrep'),
			'Wrapped command should include PATH modification with ripgrep'
		);
	});

	test('should pass wrapped command as a single quoted argument', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const command = '";echo SANDBOX_ESCAPE_REPRO; # $(uname) `id`';
		const wrappedCommand = sandboxService.wrapCommand(command);

		ok(
			wrappedCommand.includes(`-c '";echo SANDBOX_ESCAPE_REPRO; # $(uname) \`id\`'`),
			'Wrapped command should shell-quote the command argument using single quotes'
		);
		ok(
			!wrappedCommand.includes(`-c "${command}"`),
			'Wrapped command should not embed the command in double quotes'
		);
	});

	test('should keep variable and command substitution payloads literal', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const command = 'echo $HOME $(curl eth0.me) `id`';
		const wrappedCommand = sandboxService.wrapCommand(command);

		ok(
			wrappedCommand.includes(`-c 'echo $HOME $(curl eth0.me) \`id\`'`),
			'Wrapped command should keep variable and command substitutions inside the quoted argument'
		);
		ok(
			!wrappedCommand.includes(`-c ${command}`),
			'Wrapped command should not pass substitution payloads to -c without quoting'
		);
	});

	test('should escape single-quote breakout payloads in wrapped command argument', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const command = `';curl eth0.me; #'`;
		const wrappedCommand = sandboxService.wrapCommand(command);

		ok(
			wrappedCommand.includes(`-c '`),
			'Wrapped command should continue to use a single-quoted -c argument'
		);
		ok(
			wrappedCommand.includes('curl eth0.me'),
			'Wrapped command should preserve the payload text literally'
		);
		ok(
			!wrappedCommand.includes(`-c '${command}'`),
			'Wrapped command should not embed attacker-controlled single quotes without escaping'
		);
		strictEqual((wrappedCommand.match(/\\''/g) ?? []).length, 2, 'Single quote breakout payload should escape each embedded single quote');
	});

	test('should escape embedded single quotes in wrapped command argument', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrappedCommand = sandboxService.wrapCommand(`echo 'hello'`);
		strictEqual((wrappedCommand.match(/\\''/g) ?? []).length, 2, 'Single quote escapes should be inserted for each embedded single quote');
	});
});
