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
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
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
	let createdFiles: Map<string, string>;
	let createdFolders: string[];
	let deletedFolders: string[];
	const windowId = 7;

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
		getConnection() {
			return null;
		}

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
		createdFolders = [];
		deletedFolders = [];
		instantiationService = workbenchInstantiationService({}, store);
		configurationService = new TestConfigurationService();
		fileService = new MockFileService();
		lifecycleService = store.add(new TestLifecycleService());
		workspaceContextService = new MockWorkspaceContextService();
		sandboxHelperService = new MockSandboxHelperService();
		productService = {
			...TestProductService,
			dataFolderName: '.test-data',
			serverDataFolderName: '.test-server-data'
		};
		workspaceContextService.setWorkspaceFolders([URI.file('/workspace-one')]);

		// Setup default configuration
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxEnabled, true);
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains, []);
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxNetworkDeniedDomains, []);

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
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains, ['example.com', '*.github.com']);
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxNetworkDeniedDomains, ['blocked.example.com']);

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
			wrappedCommand.command.includes('PATH') && wrappedCommand.command.includes('ripgrep'),
			'Wrapped command should include PATH modification with ripgrep'
		);
		strictEqual(wrappedCommand.isSandboxWrapped, true, 'Command should stay sandbox wrapped when no domain is detected');
	});

	test('should preserve TMPDIR when unsandboxed execution is requested', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		strictEqual(sandboxService.wrapCommand('echo test', true).command, `(TMPDIR="${sandboxService.getTempDir()?.path}"; export TMPDIR; echo test)`);
	});

	test('should preserve TMPDIR for piped unsandboxed commands', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		strictEqual(sandboxService.wrapCommand('echo test | cat', true).command, `(TMPDIR="${sandboxService.getTempDir()?.path}"; export TMPDIR; echo test | cat)`);
	});

	test('should switch to unsandboxed execution when a domain is not allowlisted', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = sandboxService.wrapCommand('curl https://example.com');

		strictEqual(wrapResult.isSandboxWrapped, false, 'Blocked domains should prevent sandbox wrapping');
		strictEqual(wrapResult.requiresUnsandboxConfirmation, true, 'Blocked domains should require unsandbox confirmation');
		deepStrictEqual(wrapResult.blockedDomains, ['example.com']);
		strictEqual(wrapResult.command, `(TMPDIR="${sandboxService.getTempDir()?.path}"; export TMPDIR; curl https://example.com)`);
	});

	test('should allow exact allowlisted domains', async () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains, ['example.com']);
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = sandboxService.wrapCommand('curl https://example.com');

		strictEqual(wrapResult.isSandboxWrapped, true, 'Exact allowlisted domains should stay sandboxed');
		strictEqual(wrapResult.blockedDomains, undefined, 'Allowed domains should not be reported as blocked');
	});

	test('should allow wildcard domains', async () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains, ['*.github.com']);
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = sandboxService.wrapCommand('curl "https://api.github.com/repos/microsoft/vscode"');

		strictEqual(wrapResult.isSandboxWrapped, true, 'Wildcard allowlisted domains should stay sandboxed');
		strictEqual(wrapResult.blockedDomains, undefined, 'Wildcard allowlisted domains should not be reported as blocked');
	});

	test('should give denied domains precedence over allowlisted domains', async () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains, ['*.github.com']);
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxNetworkDeniedDomains, ['api.github.com']);
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = sandboxService.wrapCommand('curl https://api.github.com/repos/microsoft/vscode');

		strictEqual(wrapResult.isSandboxWrapped, false, 'Denied domains should not stay sandboxed');
		deepStrictEqual(wrapResult.blockedDomains, ['api.github.com']);
		deepStrictEqual(wrapResult.deniedDomains, ['api.github.com']);
	});

	test('should match uppercase hostnames when checking allowlisted domains', async () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains, ['*.github.com']);
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = sandboxService.wrapCommand('curl https://API.GITHUB.COM/repos/microsoft/vscode');

		strictEqual(wrapResult.isSandboxWrapped, true, 'Uppercase hostnames should still match allowlisted domains');
		strictEqual(wrapResult.blockedDomains, undefined, 'Uppercase allowlisted domains should not be reported as blocked');
	});

	test('should ignore malformed URL authorities with trailing punctuation', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = sandboxService.wrapCommand('curl https://example.com]/path');

		strictEqual(wrapResult.isSandboxWrapped, true, 'Malformed URL authorities should not trigger blocked-domain prompts');
		strictEqual(wrapResult.blockedDomains, undefined, 'Malformed URL authorities should be ignored');
	});

	test('should not fall back to deprecated settings outside user scope', async () => {
		const originalInspect = configurationService.inspect.bind(configurationService);
		configurationService.inspect = <T>(key: string) => {
			if (key === TerminalChatAgentToolsSettingId.AgentSandboxEnabled) {
				return {
					value: undefined,
					defaultValue: false,
					userValue: undefined,
					userLocalValue: undefined,
					userRemoteValue: undefined,
					workspaceValue: undefined,
					workspaceFolderValue: undefined,
					memoryValue: undefined,
					policyValue: undefined,
				} as ReturnType<typeof originalInspect<T>>;
			}
			if (key === TerminalChatAgentToolsSettingId.DeprecatedTerminalSandboxEnabled) {
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

	test('should fall back to deprecated settings in user scope', async () => {
		const originalInspect = configurationService.inspect.bind(configurationService);
		configurationService.inspect = <T>(key: string) => {
			if (key === TerminalChatAgentToolsSettingId.AgentSandboxEnabled) {
				return {
					value: undefined,
					defaultValue: false,
					userValue: undefined,
					userLocalValue: undefined,
					userRemoteValue: undefined,
					workspaceValue: undefined,
					workspaceFolderValue: undefined,
					memoryValue: undefined,
					policyValue: undefined,
				} as ReturnType<typeof originalInspect<T>>;
			}
			if (key === TerminalChatAgentToolsSettingId.DeprecatedTerminalSandboxEnabled) {
				return {
					value: true,
					defaultValue: false,
					userValue: true,
					userLocalValue: true,
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

		strictEqual(await sandboxService.isEnabled(), true, 'Deprecated settings should still be respected when only the user scope is set');
	});

	test('should detect ssh style remotes as domains', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const wrapResult = sandboxService.wrapCommand('git clone git@github.com:microsoft/vscode.git');

		strictEqual(wrapResult.isSandboxWrapped, false, 'SSH-style remotes should trigger domain checks');
		deepStrictEqual(wrapResult.blockedDomains, ['github.com']);
	});

	test('should pass wrapped command as a single quoted argument', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const command = '";echo SANDBOX_ESCAPE_REPRO; # $(uname) `id`';
		const wrappedCommand = sandboxService.wrapCommand(command).command;

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
		const wrappedCommand = sandboxService.wrapCommand(command).command;

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
		const wrapResult = sandboxService.wrapCommand(command);

		strictEqual(wrapResult.isSandboxWrapped, false, 'Commands with blocked domains inside substitutions should not stay sandboxed');
		strictEqual(wrapResult.requiresUnsandboxConfirmation, true, 'Blocked domains inside substitutions should require confirmation');
		deepStrictEqual(wrapResult.blockedDomains, ['eth0.me']);
		strictEqual(wrapResult.command, `(TMPDIR="${sandboxService.getTempDir()?.path}"; export TMPDIR; ${command})`);
	});

	test('should escape single-quote breakout payloads in wrapped command argument', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		await sandboxService.getSandboxConfigPath();

		const command = `';printf breakout; #'`;
		const wrappedCommand = sandboxService.wrapCommand(command).command;

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

		const wrappedCommand = sandboxService.wrapCommand(`echo 'hello'`).command;
		strictEqual((wrappedCommand.match(/\\''/g) ?? []).length, 2, 'Single quote escapes should be inserted for each embedded single quote');
	});
});
