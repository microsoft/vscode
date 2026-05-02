/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual, ok } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestLifecycleService, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestProductService } from '../../../../../test/common/workbenchTestServices.js';
import { TerminalSandboxPrerequisiteCheck, TerminalSandboxService } from '../../common/terminalSandboxService.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { AgentNetworkDomainSettingId } from '../../../../../../platform/networkFilter/common/settings.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../../../../../platform/sandbox/common/settings.js';
import { Event, Emitter } from '../../../../../../base/common/event.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { IRemoteAgentEnvironment } from '../../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { ISandboxDependencyStatus, ISandboxHelperService } from '../../../../../../platform/sandbox/common/sandboxHelperService.js';

suite('TerminalSandboxService - network domains', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let fileService: MockFileService;
	let lifecycleService: TestLifecycleService;
	let workspaceContextService: MockWorkspaceContextService;
	let productService: IProductService;
	let sandboxHelperService: MockSandboxHelperService;
	let remoteAgentService: MockRemoteAgentService;
	let createdFiles: Map<string, string>;
	let createFileCount: number;
	let createdFolders: string[];
	let deletedFolders: string[];
	const windowId = 7;

	class MockFileService {
		async createFile(uri: URI, content: VSBuffer): Promise<any> {
			createFileCount++;
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
		remoteEnvironment: IRemoteAgentEnvironment | null = {
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

		getConnection() {
			return null;
		}

		async getEnvironment(): Promise<IRemoteAgentEnvironment | null> {
			// Return a Linux environment to ensure tests pass on Windows
			// (sandbox is not supported on Windows)
			return this.remoteEnvironment;
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

	class MockSandboxHelperService implements ISandboxHelperService {
		_serviceBrand: undefined;
		callCount = 0;
		status: ISandboxDependencyStatus = {
			bubblewrapInstalled: true,
			socatInstalled: true,
		};

		checkSandboxDependencies(): Promise<ISandboxDependencyStatus> {
			this.callCount++;
			return Promise.resolve(this.status);
		}
	}

	setup(() => {
		createdFiles = new Map();
		createFileCount = 0;
		createdFolders = [];
		deletedFolders = [];
		instantiationService = workbenchInstantiationService({}, store);
		configurationService = new TestConfigurationService();
		fileService = new MockFileService();
		lifecycleService = store.add(new TestLifecycleService());
		workspaceContextService = new MockWorkspaceContextService();
		sandboxHelperService = new MockSandboxHelperService();
		remoteAgentService = new MockRemoteAgentService();
		productService = {
			...TestProductService,
			dataFolderName: '.test-data',
			serverDataFolderName: '.test-server-data'
		};
		workspaceContextService.setWorkspaceFolders([URI.file('/workspace-one')]);

		// Setup default configuration
		configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.On);
		configurationService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
		configurationService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, []);

		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IEnvironmentService, <IEnvironmentService & { tmpDir?: URI; execPath?: string; window?: { id: number }; userHome?: URI; userDataPath?: string }>{
			_serviceBrand: undefined,
			tmpDir: URI.file('/tmp'),
			execPath: '/usr/bin/node',
			userHome: URI.file('/home/local-user'),
			userDataPath: '/custom/local-user-data',
			window: { id: windowId }
		});
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IProductService, productService);
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		instantiationService.stub(IWorkspaceContextService, workspaceContextService);
		instantiationService.stub(ILifecycleService, lifecycleService);
		instantiationService.stub(ISandboxHelperService, sandboxHelperService);
	});

	test('dependency checks should not be called for isEnabled', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));

		strictEqual(await sandboxService.isEnabled(), true, 'Sandbox should be enabled when dependencies are present');
		strictEqual(await sandboxService.isEnabled(), true, 'Sandbox should stay enabled on subsequent checks');
		strictEqual(sandboxHelperService.callCount, 0, 'Dependency checks should not be called for isEnabled');
	});

	test('should report dependency prereq failures', async () => {
		sandboxHelperService.status = {
			bubblewrapInstalled: false,
			socatInstalled: true,
		};

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const result = await sandboxService.checkForSandboxingPrereqs();

		strictEqual(result.enabled, true, 'Sandbox should be enabled even when dependencies are missing');
		strictEqual(result.failedCheck, TerminalSandboxPrerequisiteCheck.Dependencies, 'Missing dependencies should be reported as the failed prereq');
		strictEqual(result.missingDependencies?.length, 1, 'Missing dependency list should be included');
		strictEqual(result.missingDependencies?.[0], 'bubblewrap', 'The missing dependency should be reported');
		ok(result.sandboxConfigPath, 'Sandbox config path should still be returned when config creation succeeds');
	});

	test('should report successful sandbox prereq checks', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const result = await sandboxService.checkForSandboxingPrereqs();

		strictEqual(result.enabled, true, 'Sandbox should be enabled when prereqs pass');
		strictEqual(result.failedCheck, undefined, 'No failed check should be reported when prereqs pass');
		strictEqual(result.missingDependencies, undefined, 'Missing dependencies should be omitted when prereqs pass');
		ok(result.sandboxConfigPath, 'Sandbox config path should be returned when prereqs pass');
	});

	test('should preserve configured network domains', async () => {
		configurationService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['example.com', '*.github.com']);
		configurationService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['blocked.example.com']);

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		deepStrictEqual(sandboxService.getResolvedNetworkDomains(), {
			allowedDomains: ['example.com', '*.github.com'],
			deniedDomains: ['blocked.example.com']
		});

		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const configContent = createdFiles.get(configPath);
		ok(configContent, 'Config file should be created');

		const config = JSON.parse(configContent);
		deepStrictEqual(config.network, {
			allowedDomains: ['example.com', '*.github.com'],
			deniedDomains: ['blocked.example.com']
		});
	});

	test('should write configured runtime values to sandbox config root', async () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxAdvancedRuntime, {
			allowUnixSockets: true,
			networkProxy: {
				enabled: true,
				mode: 'strict'
			}
		});

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const configContent = createdFiles.get(configPath);
		ok(configContent, 'Config file should be created');

		const config = JSON.parse(configContent);
		strictEqual(config.allowUnixSockets, true);
		deepStrictEqual(config.networkProxy, {
			enabled: true,
			mode: 'strict'
		});
	});

	test('should omit runtime root-level entries when runtime setting is empty', async () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxAdvancedRuntime, {});

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const configContent = createdFiles.get(configPath);
		ok(configContent, 'Config file should be created');

		const config = JSON.parse(configContent);
		strictEqual(Object.prototype.hasOwnProperty.call(config, 'allowUnixSockets'), false, 'Runtime keys should be omitted when the runtime setting is empty');
		strictEqual(Object.prototype.hasOwnProperty.call(config, 'networkProxy'), false, 'Nested runtime keys should be omitted when the runtime setting is empty');
	});

	test('should rewrite sandbox config when runtime setting changes', async () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxAdvancedRuntime, {
			allowUnixSockets: true,
		});

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const initialConfigContent = createdFiles.get(configPath);
		ok(initialConfigContent, 'Config file should be created for the initial runtime values');
		strictEqual(JSON.parse(initialConfigContent).allowUnixSockets, true);

		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxAdvancedRuntime, {
			allowUnixSockets: false,
			networkProxy: {
				enabled: true
			}
		});
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: (key: string) => key === TerminalChatAgentToolsSettingId.AgentSandboxAdvancedRuntime,
			affectedKeys: new Set([TerminalChatAgentToolsSettingId.AgentSandboxAdvancedRuntime]),
			source: ConfigurationTarget.USER,
			change: null!,
		});

		const refreshedConfigPath = await sandboxService.getSandboxConfigPath();
		strictEqual(refreshedConfigPath, configPath, 'Config path should stay stable when the config is refreshed');

		const refreshedConfigContent = createdFiles.get(configPath);
		ok(refreshedConfigContent, 'Config file should be rewritten after runtime setting changes');

		const refreshedConfig = JSON.parse(refreshedConfigContent);
		strictEqual(refreshedConfig.allowUnixSockets, false);
		deepStrictEqual(refreshedConfig.networkProxy, {
			enabled: true
		});
	});

	test('should not override schema-defined network and filesystem config with runtime settings', async () => {
		configurationService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['example.com']);
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem, {
			allowWrite: ['/configured/path'],
			denyRead: [],
			allowRead: ['/configured/readable/path'],
			denyWrite: []
		});
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxAdvancedRuntime, {
			network: {
				allowedDomains: ['should-not-win.example'],
				allowUnixSockets: true,
			},
			filesystem: {
				allowWrite: ['/should-not-win'],
				allowRead: ['/should-not-win-readable'],
				unixSockets: {
					enabled: true,
				}
			},
			allowUnixSockets: true,
		});

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const configContent = createdFiles.get(configPath);
		ok(configContent, 'Config file should be created');

		const config = JSON.parse(configContent);
		deepStrictEqual(config.network, {
			allowedDomains: ['example.com'],
			deniedDomains: [],
			allowUnixSockets: true,
		});
		ok(config.filesystem.allowWrite.includes('/configured/path'), 'Configured filesystem values should be preserved');
		ok(!config.filesystem.allowWrite.includes('/should-not-win'), 'Runtime filesystem values should not override schema-defined filesystem config');
		ok(config.filesystem.allowRead.includes('/configured/readable/path'), 'Configured allowRead values should be preserved');
		ok(config.filesystem.allowRead.includes('/workspace-one'), 'Generated allowRead should include workspace folders');
		ok(config.filesystem.allowRead.includes('/configured/path'), 'Generated allowRead should include configured allowWrite paths');
		ok(!config.filesystem.allowRead.includes('/should-not-win-readable'), 'Runtime filesystem allowRead should not override schema-defined filesystem config');
		deepStrictEqual(config.filesystem.unixSockets, {
			enabled: true,
		}, 'Additional nested runtime filesystem properties should be merged in');
		strictEqual(config.allowUnixSockets, true, 'Non-conflicting runtime properties should still be added');
	});

	test('should deny home reads while reallowing writable paths for reads', async () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem, {
			allowWrite: ['/configured/path'],
			denyRead: ['/secret/path'],
			allowRead: ['/configured/readable/path'],
			denyWrite: []
		});

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const configContent = createdFiles.get(configPath);
		ok(configContent, 'Config file should be created');

		const config = JSON.parse(configContent);
		ok(config.filesystem.denyRead.includes('/home/user'), 'Sandbox config should deny arbitrary reads from the user home');
		ok(config.filesystem.denyRead.includes('/secret/path'), 'Sandbox config should preserve configured denyRead paths');
		ok(config.filesystem.allowRead.includes('/workspace-one'), 'Sandbox config should re-allow reads from workspace folders');
		ok(config.filesystem.allowRead.includes('/configured/path'), 'Sandbox config should re-allow reads from configured allowWrite paths');
		ok(config.filesystem.allowRead.includes('/configured/readable/path'), 'Sandbox config should preserve configured allowRead paths');
		ok(config.filesystem.allowRead.includes('/home/user/.npm'), 'Sandbox config should re-allow reads from default write paths');
		ok(!config.filesystem.allowRead.includes('/home/user/.gitconfig'), 'Sandbox config should not include command-specific git read allow-list paths before a command is parsed');
		ok(!config.filesystem.allowRead.includes('/home/user/.nvm/versions'), 'Sandbox config should not include command-specific node read allow-list paths before a command is parsed');
		ok(!config.filesystem.allowRead.includes('/home/user/.cache/pip'), 'Sandbox config should not include command-specific common dev read allow-list paths before a command is parsed');
		ok(config.filesystem.allowRead.includes('/app'), 'Sandbox config should include the VS Code app root');
		ok(!config.filesystem.allowRead.includes('/app/node'), 'Sandbox config should not redundantly include app root child paths');
		ok(!config.filesystem.allowRead.includes('/app/node_modules'), 'Sandbox config should not redundantly include app root child paths');
		ok(!config.filesystem.allowRead.includes('/app/node_modules/@vscode/ripgrep'), 'Sandbox config should not redundantly include app root child paths');
	});

	test('should only add command-specific allowRead paths for the current command keywords', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		await sandboxService.wrapCommand('node --version', false, 'bash', ['node']);
		const nodeConfigContent = createdFiles.get(configPath);
		ok(nodeConfigContent, 'Config file should be rewritten for node commands');

		const nodeConfig = JSON.parse(nodeConfigContent);
		ok(nodeConfig.filesystem.allowRead.includes('/home/user/.nvm/versions'), 'Node commands should include node-specific read allow-list paths');
		ok(!nodeConfig.filesystem.allowRead.includes('/home/user/.gitconfig'), 'Node commands should not include git-specific read allow-list paths');

		await sandboxService.wrapCommand('git status', false, 'bash', ['git']);
		const gitConfigContent = createdFiles.get(configPath);
		ok(gitConfigContent, 'Config file should be rewritten for git commands');

		const gitConfig = JSON.parse(gitConfigContent);
		ok(gitConfig.filesystem.allowRead.includes('/home/user/.gitconfig'), 'Git commands should include git-specific read allow-list paths');
		ok(!gitConfig.filesystem.allowRead.includes('/home/user/.nvm/versions'), 'Refreshing for a new command should start allowRead from the current command keywords');
	});

	test('should not rewrite sandbox config when the parsed command keywords are unchanged', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const initialCreateFileCount = createFileCount;

		await sandboxService.wrapCommand('node --version', false, 'bash', ['node']);
		const afterFirstNodeCommandCount = createFileCount;
		strictEqual(afterFirstNodeCommandCount, initialCreateFileCount + 1, 'First node command should rewrite the config once');

		await sandboxService.wrapCommand('node app.js', false, 'bash', ['node']);
		strictEqual(createFileCount, afterFirstNodeCommandCount, 'Second node command should not rewrite the config when keywords are unchanged');
	});

	test('should expand home paths in linux filesystem sandbox config paths', async () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem, {
			allowWrite: ['~/.custom-write', '/glob/**/*.ts'],
			denyRead: ['~/.secret', '/secret/*'],
			allowRead: ['~/.custom-readable', '/readable/{a,b}'],
			denyWrite: ['~/.custom-write/file.txt', '/configured/path/file?.txt']
		});

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const configContent = createdFiles.get(configPath);
		ok(configContent, 'Config file should be created');

		const config = JSON.parse(configContent);
		ok(config.filesystem.allowWrite.includes('/home/user/.custom-write'), 'allowWrite should expand home paths on Linux');
		ok(config.filesystem.allowWrite.includes('/glob/**/*.ts'), 'Non-home allowWrite paths should be preserved');
		ok(!config.filesystem.allowWrite.includes('~/.custom-write'), 'allowWrite should not include unexpanded home paths on Linux');
		ok(config.filesystem.denyRead.includes('/home/user/.secret'), 'denyRead should expand home paths on Linux');
		ok(config.filesystem.denyRead.includes('/secret/*'), 'Non-home denyRead paths should be preserved');
		ok(!config.filesystem.denyRead.includes('~/.secret'), 'denyRead should not include unexpanded home paths on Linux');
		ok(config.filesystem.allowRead.includes('/home/user/.custom-readable'), 'allowRead should expand home paths on Linux');
		ok(config.filesystem.allowRead.includes('/readable/{a,b}'), 'Non-home allowRead paths should be preserved');
		ok(!config.filesystem.allowRead.includes('~/.custom-readable'), 'allowRead should not include unexpanded home paths on Linux');
		ok(config.filesystem.denyWrite.includes('/home/user/.custom-write/file.txt'), 'denyWrite should expand home paths on Linux');
		ok(config.filesystem.denyWrite.includes('/configured/path/file?.txt'), 'Non-home denyWrite paths should be preserved');
		ok(!config.filesystem.denyWrite.includes('~/.custom-write/file.txt'), 'denyWrite should not include unexpanded home paths on Linux');
	});

	test('should deny home reads while reallowing writable paths for reads on macOS', async () => {
		remoteAgentService.remoteEnvironment = {
			...remoteAgentService.remoteEnvironment!,
			os: OperatingSystem.Macintosh
		};
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem, {
			allowWrite: ['/configured/path'],
			denyRead: ['/secret/path'],
			allowRead: ['/configured/readable/path'],
			denyWrite: []
		});

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const configContent = createdFiles.get(configPath);
		ok(configContent, 'Config file should be created');

		const config = JSON.parse(configContent);
		ok(config.filesystem.denyRead.includes('/home/user'), 'Sandbox config should deny arbitrary reads from the user home on macOS');
		ok(config.filesystem.denyRead.includes('/secret/path'), 'Sandbox config should preserve configured denyRead paths on macOS');
		ok(config.filesystem.allowRead.includes('/workspace-one'), 'Sandbox config should re-allow reads from workspace folders on macOS');
		ok(config.filesystem.allowRead.includes('/configured/path'), 'Sandbox config should re-allow reads from configured allowWrite paths on macOS');
		ok(config.filesystem.allowRead.includes('/configured/readable/path'), 'Sandbox config should preserve configured allowRead paths on macOS');
	});

	test('should not expand home paths in macOS filesystem sandbox config paths', async () => {
		remoteAgentService.remoteEnvironment = {
			...remoteAgentService.remoteEnvironment!,
			os: OperatingSystem.Macintosh
		};
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem, {
			allowWrite: ['~/.custom-write', '/glob/**/*.ts'],
			denyRead: ['~/.secret', '/secret/*'],
			allowRead: ['~/.custom-readable', '/readable/{a,b}'],
			denyWrite: ['~/.custom-write/file.txt', '/configured/path/file?.txt']
		});

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const configPath = await sandboxService.getSandboxConfigPath();

		ok(configPath, 'Config path should be defined');
		const configContent = createdFiles.get(configPath);
		ok(configContent, 'Config file should be created');

		const config = JSON.parse(configContent);
		ok(config.filesystem.allowWrite.includes('~/.custom-write'), 'allowWrite should preserve unexpanded home paths on macOS');
		ok(config.filesystem.allowWrite.includes('/glob/**/*.ts'), 'Non-home allowWrite paths should be preserved on macOS');
		ok(!config.filesystem.allowWrite.includes('/home/user/.custom-write'), 'allowWrite should not expand ~ on macOS');
		ok(config.filesystem.denyRead.includes('~/.secret'), 'denyRead should preserve unexpanded home paths on macOS');
		ok(config.filesystem.denyRead.includes('/secret/*'), 'Non-home denyRead paths should be preserved on macOS');
		ok(!config.filesystem.denyRead.includes('/home/user/.secret'), 'denyRead should not expand ~ on macOS');
		ok(config.filesystem.allowRead.includes('~/.custom-readable'), 'allowRead should preserve unexpanded home paths on macOS');
		ok(config.filesystem.allowRead.includes('/readable/{a,b}'), 'Non-home allowRead paths should be preserved on macOS');
		ok(!config.filesystem.allowRead.includes('/home/user/.custom-readable'), 'allowRead should not expand ~ on macOS');
		ok(config.filesystem.denyWrite.includes('~/.custom-write/file.txt'), 'denyWrite should preserve unexpanded home paths on macOS');
		ok(config.filesystem.denyWrite.includes('/configured/path/file?.txt'), 'Non-home denyWrite paths should be preserved on macOS');
		ok(!config.filesystem.denyWrite.includes('/home/user/.custom-write/file.txt'), 'denyWrite should not expand ~ on macOS');
	});

	test('should refresh allowWrite paths when workspace folders change', async () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem, {
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
		ok(initialConfig.filesystem.denyRead.includes('/home/user'), 'Initial config should deny arbitrary reads from home');
		ok(initialConfig.filesystem.allowRead.includes('/workspace-one'), 'Initial config should re-allow reading the original workspace folder');
		ok(initialConfig.filesystem.allowRead.includes('/configured/path'), 'Initial config should re-allow reading configured allowWrite paths');

		workspaceContextService.setWorkspaceFolders([URI.file('/workspace-two')]);

		const refreshedConfigPath = await sandboxService.getSandboxConfigPath();
		strictEqual(refreshedConfigPath, configPath, 'Config path should stay stable when the config is refreshed');

		const refreshedConfigContent = createdFiles.get(configPath);
		ok(refreshedConfigContent, 'Config file should be rewritten after workspace folders change');

		const refreshedConfig = JSON.parse(refreshedConfigContent);
		ok(refreshedConfig.filesystem.allowWrite.includes('/workspace-two'), 'Refreshed config should include the updated workspace folder');
		ok(!refreshedConfig.filesystem.allowWrite.includes('/workspace-one'), 'Refreshed config should remove the old workspace folder');
		ok(refreshedConfig.filesystem.allowWrite.includes('/configured/path'), 'Refreshed config should preserve configured allowWrite paths');
		ok(refreshedConfig.filesystem.denyRead.includes('/home/user'), 'Refreshed config should continue to deny arbitrary reads from home');
		ok(refreshedConfig.filesystem.allowRead.includes('/workspace-two'), 'Refreshed config should re-allow reading the updated workspace folder');
		ok(!refreshedConfig.filesystem.allowRead.includes('/workspace-one'), 'Refreshed config should remove the old workspace folder from allowRead');
		ok(refreshedConfig.filesystem.allowRead.includes('/configured/path'), 'Refreshed config should preserve configured allowWrite paths in allowRead');
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

		const wrappedCommand = await sandboxService.wrapCommand('echo test');

		ok(
			wrappedCommand.command.includes('PATH') && wrappedCommand.command.includes('ripgrep'),
			'Wrapped command should include PATH modification with ripgrep'
		);
		strictEqual(wrappedCommand.isSandboxWrapped, true, 'Command should stay sandbox wrapped when no domain is detected');
	});

	test('should launch Linux sandbox runtime from temp dir while preserving the command cwd', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = await sandboxService.wrapCommand('head -1 /etc/shells', false, 'bash', undefined, URI.file('/workspace-one'));
		const expectedWrappedCwd = String.raw`-c 'cd '\''/workspace-one'\'' && head -1 /etc/shells'`;

		ok(wrapResult.command.startsWith(`cd '${sandboxService.getTempDir()?.path}'; `), 'Sandbox runtime should start from the sandbox temp dir on Linux');
		ok(wrapResult.command.includes(expectedWrappedCwd), `Sandboxed command should restore the original cwd before running the user command. Actual: ${wrapResult.command}`);
		strictEqual(wrapResult.isSandboxWrapped, true, 'Command should remain sandbox wrapped');
	});

	test('should preserve TMPDIR when unsandboxed execution is requested', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		strictEqual((await sandboxService.wrapCommand('echo test', true, 'bash')).command, `env TMPDIR="${sandboxService.getTempDir()?.path}" 'bash' -c 'echo test'`);
	});

	test('should preserve TMPDIR for piped unsandboxed commands', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		strictEqual((await sandboxService.wrapCommand('echo test | cat', true, 'bash')).command, `env TMPDIR="${sandboxService.getTempDir()?.path}" 'bash' -c 'echo test | cat'`);
	});

	test('should preserve trailing backslashes for unsandboxed commands', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		strictEqual((await sandboxService.wrapCommand('echo test \\', true, 'bash')).command, `env TMPDIR="${sandboxService.getTempDir()?.path}" 'bash' -c 'echo test \\'`);
	});

	test('should use fish-compatible wrapping for unsandboxed commands', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		strictEqual((await sandboxService.wrapCommand('echo test', true, 'fish')).command, `env TMPDIR="${sandboxService.getTempDir()?.path}" 'fish' -c 'echo test'`);
	});

	test('should switch to unsandboxed execution when a domain is not allowlisted', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = await sandboxService.wrapCommand('curl https://example.com', false, 'bash');

		strictEqual(wrapResult.isSandboxWrapped, false, 'Blocked domains should prevent sandbox wrapping');
		strictEqual(wrapResult.requiresUnsandboxConfirmation, true, 'Blocked domains should require unsandbox confirmation');
		deepStrictEqual(wrapResult.blockedDomains, ['example.com']);
		strictEqual(wrapResult.command, `env TMPDIR="${sandboxService.getTempDir()?.path}" 'bash' -c 'curl https://example.com'`);
	});

	test('should allow exact allowlisted domains', async () => {
		configurationService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['example.com']);
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = await sandboxService.wrapCommand('curl https://example.com');

		strictEqual(wrapResult.isSandboxWrapped, true, 'Exact allowlisted domains should stay sandboxed');
		strictEqual(wrapResult.blockedDomains, undefined, 'Allowed domains should not be reported as blocked');
	});

	test('should allow wildcard domains', async () => {
		configurationService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['*.github.com']);
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = await sandboxService.wrapCommand('curl "https://api.github.com/repos/microsoft/vscode"');

		strictEqual(wrapResult.isSandboxWrapped, true, 'Wildcard allowlisted domains should stay sandboxed');
		strictEqual(wrapResult.blockedDomains, undefined, 'Wildcard allowlisted domains should not be reported as blocked');
	});

	test('should give denied domains precedence over allowlisted domains', async () => {
		configurationService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['*.github.com']);
		configurationService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['api.github.com']);
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = await sandboxService.wrapCommand('curl https://api.github.com/repos/microsoft/vscode');

		strictEqual(wrapResult.isSandboxWrapped, false, 'Denied domains should not stay sandboxed');
		deepStrictEqual(wrapResult.blockedDomains, ['api.github.com']);
		deepStrictEqual(wrapResult.deniedDomains, ['api.github.com']);
	});

	test('should match uppercase hostnames when checking allowlisted domains', async () => {
		configurationService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['*.github.com']);
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = await sandboxService.wrapCommand('curl https://API.GITHUB.COM/repos/microsoft/vscode');

		strictEqual(wrapResult.isSandboxWrapped, true, 'Uppercase hostnames should still match allowlisted domains');
		strictEqual(wrapResult.blockedDomains, undefined, 'Uppercase allowlisted domains should not be reported as blocked');
	});

	test('should ignore malformed URL authorities with trailing punctuation', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = await sandboxService.wrapCommand('curl https://example.com]/path');

		strictEqual(wrapResult.isSandboxWrapped, true, 'Malformed URL authorities should not trigger blocked-domain prompts');
		strictEqual(wrapResult.blockedDomains, undefined, 'Malformed URL authorities should be ignored');
	});

	test('should ignore file-extension suffixes that look like domains', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const javascriptResult = await sandboxService.wrapCommand('cat bundle.js', false, 'bash');
		strictEqual(javascriptResult.isSandboxWrapped, true, 'File extensions such as .js should not trigger blocked-domain prompts');
		strictEqual(javascriptResult.blockedDomains, undefined, 'File extensions such as .js should not be reported as domains');

		const jsonResult = await sandboxService.wrapCommand('cat package.json', false, 'bash');
		strictEqual(jsonResult.isSandboxWrapped, true, 'File extensions such as .json should not trigger blocked-domain prompts');
		strictEqual(jsonResult.blockedDomains, undefined, 'File extensions such as .json should not be reported as domains');
	});

	test('should ignore bare dotted values with unknown domain suffixes', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const commands = [
			'echo test.invalidtld',
			'echo test.org.invalidtld',
			'echo session.completed',
		];

		for (const command of commands) {
			const wrapResult = await sandboxService.wrapCommand(command, false, 'bash');
			strictEqual(wrapResult.isSandboxWrapped, true, `Command ${command} should remain sandboxed`);
			strictEqual(wrapResult.blockedDomains, undefined, `Command ${command} should not report a blocked domain`);
		}
	});

	test('should still detect bare hosts with well-known domain suffixes', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const testComResult = await sandboxService.wrapCommand('curl test.com', false, 'bash');
		strictEqual(testComResult.isSandboxWrapped, false, 'Well-known bare domain suffixes should trigger domain checks');
		deepStrictEqual(testComResult.blockedDomains, ['test.com']);

		const testOrgComResult = await sandboxService.wrapCommand('curl test.org.com', false, 'bash');
		strictEqual(testOrgComResult.isSandboxWrapped, false, 'Well-known bare domain suffixes should trigger domain checks for multi-label hosts');
		deepStrictEqual(testOrgComResult.blockedDomains, ['test.org.com']);
	});

	test('should still treat URL authorities with file-like suffixes as domains', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = await sandboxService.wrapCommand('curl https://example.zip/path', false, 'bash');

		strictEqual(wrapResult.isSandboxWrapped, false, 'URL authorities should still trigger blocked-domain prompts even when their suffix looks like a file extension');
		deepStrictEqual(wrapResult.blockedDomains, ['example.zip']);
	});

	test('should still treat URL authorities with unknown suffixes as domains', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = await sandboxService.wrapCommand('curl https://example.bar/path', false, 'bash');

		strictEqual(wrapResult.isSandboxWrapped, false, 'URL authorities should not require a well-known bare-host suffix');
		deepStrictEqual(wrapResult.blockedDomains, ['example.bar']);
	});

	test('should still treat ssh remotes with file-like suffixes as domains', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = await sandboxService.wrapCommand('git clone git@example.zip:owner/repo.git', false, 'bash');

		strictEqual(wrapResult.isSandboxWrapped, false, 'SSH remotes should still trigger blocked-domain prompts even when their suffix looks like a file extension');
		deepStrictEqual(wrapResult.blockedDomains, ['example.zip']);
	});

	test('should not treat filenames in commands as domains', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const commands = [
			'node server.js',
			'php index.php',
			'java -jar app.java',
			'cat styles.css',
			'cat README.md',
			'cat .env',
		];

		for (const command of commands) {
			const wrapResult = await sandboxService.wrapCommand(command, false, 'bash');
			strictEqual(wrapResult.isSandboxWrapped, true, `Command ${command} should remain sandboxed`);
			strictEqual(wrapResult.blockedDomains, undefined, `Command ${command} should not report a blocked domain`);
		}
	});

	test('should not fall back to deprecated settings outside user scope', async () => {
		const originalInspect = configurationService.inspect.bind(configurationService);
		configurationService.inspect = <T>(key: string) => {
			if (key === AgentSandboxSettingId.AgentSandboxEnabled) {
				return {
					value: undefined,
					defaultValue: AgentSandboxEnabledValue.Off,
					userValue: undefined,
					userLocalValue: undefined,
					userRemoteValue: undefined,
					workspaceValue: undefined,
					workspaceFolderValue: undefined,
					memoryValue: undefined,
					policyValue: undefined,
				} as ReturnType<typeof originalInspect<T>>;
			}
			if (key === AgentSandboxSettingId.DeprecatedAgentSandboxEnabled) {
				return {
					value: true,
					defaultValue: false,
					userValue: undefined,
					userLocalValue: undefined,
					userRemoteValue: undefined,
					workspaceValue: true,
					workspaceFolderValue: undefined,
					memoryValue: undefined,
					policyValue: undefined,
				} as ReturnType<typeof originalInspect<T>>;
			}
			return originalInspect<T>(key);
		};

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));

		strictEqual(await sandboxService.isEnabled(), false, 'Deprecated settings should not be used when only non-user scopes are set');
	});

	test('should not fall back to deprecated chat.agent.sandbox setting due to namespace conflicts', async () => {
		configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, undefined);
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem, {
			allowWrite: ['/tmp']
		});
		const namespaceValue = { fileSystem: { linux: { allowWrite: ['/tmp'] } } };
		const originalInspect = configurationService.inspect.bind(configurationService);
		configurationService.inspect = <T>(key: string) => {
			if (key === AgentSandboxSettingId.DeprecatedAgentSandboxEnabled) {
				return {
					value: namespaceValue,
					defaultValue: false,
					userValue: namespaceValue,
					userLocalValue: namespaceValue,
					userRemoteValue: undefined,
					workspaceValue: undefined,
					workspaceFolderValue: undefined,
					memoryValue: undefined,
					policyValue: undefined,
				} as ReturnType<typeof originalInspect<T>>;
			}
			return originalInspect<T>(key);
		};

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));

		strictEqual(await sandboxService.isEnabled(), false, 'Child settings under chat.agent.sandbox should not be treated as the deprecated boolean setting');
	});

	test('should fall back to deprecated chat.agent.sandbox setting in user scope', async () => {
		configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, undefined);
		configurationService.setUserConfiguration(AgentSandboxSettingId.DeprecatedAgentSandboxEnabled, true);

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));

		strictEqual(await sandboxService.isEnabled(), true, 'Deprecated chat.agent.sandbox should still be respected when only the user scope is set');
	});

	test('should detect ssh style remotes as domains', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = await sandboxService.wrapCommand('git clone git@github.com:microsoft/vscode.git');

		strictEqual(wrapResult.isSandboxWrapped, false, 'SSH-style remotes should trigger domain checks');
		deepStrictEqual(wrapResult.blockedDomains, ['github.com']);
	});

	test('should pass wrapped command as a single quoted argument', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const command = '";echo SANDBOX_ESCAPE_REPRO; # $(uname) `id`';
		const wrappedCommand = (await sandboxService.wrapCommand(command)).command;

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

		const command = 'echo $HOME $(printf literal) `id`';
		const wrappedCommand = (await sandboxService.wrapCommand(command)).command;

		ok(
			wrappedCommand.includes(`-c 'echo $HOME $(printf literal) \`id\`'`),
			'Wrapped command should keep variable and command substitutions inside the quoted argument'
		);
		ok(
			!wrappedCommand.includes(`-c ${command}`),
			'Wrapped command should not pass substitution payloads to -c without quoting'
		);
	});

	test('should detect blocked domains inside command substitutions', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const command = 'echo $HOME $(curl eth0.me) `id`';
		const wrapResult = await sandboxService.wrapCommand(command, false, 'bash');

		strictEqual(wrapResult.isSandboxWrapped, false, 'Commands with blocked domains inside substitutions should not stay sandboxed');
		strictEqual(wrapResult.requiresUnsandboxConfirmation, true, 'Blocked domains inside substitutions should require confirmation');
		deepStrictEqual(wrapResult.blockedDomains, ['eth0.me']);
		strictEqual(wrapResult.command, `env TMPDIR="${sandboxService.getTempDir()?.path}" 'bash' -c 'echo $HOME $(curl eth0.me) \`id\`'`);
	});

	test('should escape single-quote breakout payloads in wrapped command argument', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const command = `';printf breakout; #'`;
		const wrappedCommand = (await sandboxService.wrapCommand(command)).command;

		ok(
			wrappedCommand.includes(`-c '`),
			'Wrapped command should continue to use a single-quoted -c argument'
		);
		ok(
			wrappedCommand.includes('printf breakout'),
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

		const wrappedCommand = (await sandboxService.wrapCommand(`echo 'hello'`)).command;
		strictEqual((wrappedCommand.match(/\\''/g) ?? []).length, 2, 'Single quote escapes should be inserted for each embedded single quote');
	});
});
