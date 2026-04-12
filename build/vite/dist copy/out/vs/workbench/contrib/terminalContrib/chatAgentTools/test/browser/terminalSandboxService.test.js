/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, strictEqual, ok } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestLifecycleService, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestProductService } from '../../../../../test/common/workbenchTestServices.js';
import { TerminalSandboxService } from '../../common/terminalSandboxService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Event, Emitter } from '../../../../../../base/common/event.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { ISandboxHelperService } from '../../../../../../platform/sandbox/common/sandboxHelperService.js';
suite('TerminalSandboxService - network domains', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let configurationService;
    let fileService;
    let lifecycleService;
    let workspaceContextService;
    let productService;
    let sandboxHelperService;
    let createdFiles;
    let createdFolders;
    let deletedFolders;
    const windowId = 7;
    class MockFileService {
        async createFile(uri, content) {
            const contentString = content.toString();
            createdFiles.set(uri.path, contentString);
            return {};
        }
        async createFolder(uri) {
            createdFolders.push(uri.path);
            return {};
        }
        async del(uri) {
            deletedFolders.push(uri.path);
        }
    }
    class MockRemoteAgentService {
        getConnection() {
            return null;
        }
        async getEnvironment() {
            // Return a Linux environment to ensure tests pass on Windows
            // (sandbox is not supported on Windows)
            return {
                os: 3 /* OperatingSystem.Linux */,
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
    class MockWorkspaceContextService {
        constructor() {
            this.onDidChangeWorkbenchState = Event.None;
            this.onDidChangeWorkspaceName = Event.None;
            this.onWillChangeWorkspaceFolders = Event.None;
            this._onDidChangeWorkspaceFolders = new Emitter();
            this.onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;
            this._workspace = testWorkspace();
        }
        getCompleteWorkspace() {
            return Promise.resolve(this._workspace);
        }
        getWorkspace() {
            return this._workspace;
        }
        getWorkbenchState() {
            return this._workspace.folders.length > 0 ? 2 /* WorkbenchState.FOLDER */ : 1 /* WorkbenchState.EMPTY */;
        }
        getWorkspaceFolder(_resource) {
            return null;
        }
        isCurrentWorkspace(_workspaceIdOrFolder) {
            return false;
        }
        isInsideWorkspace(_resource) {
            return false;
        }
        hasWorkspaceData() {
            return this._workspace.folders.length > 0;
        }
        setWorkspaceFolders(folders) {
            const previousFolders = this._workspace.folders;
            this._workspace = testWorkspace(...folders);
            this._onDidChangeWorkspaceFolders.fire({
                added: this._workspace.folders.filter(folder => !previousFolders.some(previousFolder => previousFolder.uri.toString() === folder.uri.toString())),
                removed: previousFolders.filter(folder => !this._workspace.folders.some(nextFolder => nextFolder.uri.toString() === folder.uri.toString())),
                changed: []
            });
        }
    }
    class MockSandboxHelperService {
        constructor() {
            this.callCount = 0;
            this.status = {
                bubblewrapInstalled: true,
                socatInstalled: true,
            };
        }
        checkSandboxDependencies() {
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
        configurationService.setUserConfiguration("chat.agent.sandbox.enabled" /* TerminalChatAgentToolsSettingId.AgentSandboxEnabled */, "on" /* TerminalChatAgentToolsSandboxEnabledValue.On */);
        configurationService.setUserConfiguration("chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */, []);
        configurationService.setUserConfiguration("chat.agent.sandbox.deniedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkDeniedDomains */, []);
        instantiationService.stub(IConfigurationService, configurationService);
        instantiationService.stub(IFileService, fileService);
        instantiationService.stub(IEnvironmentService, {
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
        strictEqual(result.failedCheck, "dependencies" /* TerminalSandboxPrerequisiteCheck.Dependencies */, 'Missing dependencies should be reported as the failed prereq');
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
        configurationService.setUserConfiguration("chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */, ['example.com', '*.github.com']);
        configurationService.setUserConfiguration("chat.agent.sandbox.deniedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkDeniedDomains */, ['blocked.example.com']);
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
        configurationService.setUserConfiguration("chat.agent.sandbox.fileSystem.linux" /* TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem */, {
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
        ok(wrappedCommand.command.includes('PATH') && wrappedCommand.command.includes('ripgrep'), 'Wrapped command should include PATH modification with ripgrep');
        strictEqual(wrappedCommand.isSandboxWrapped, true, 'Command should stay sandbox wrapped when no domain is detected');
    });
    test('should preserve TMPDIR when unsandboxed execution is requested', async () => {
        const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
        await sandboxService.getSandboxConfigPath();
        strictEqual(sandboxService.wrapCommand('echo test', true, 'bash').command, `env TMPDIR="${sandboxService.getTempDir()?.path}" 'bash' -c 'echo test'`);
    });
    test('should preserve TMPDIR for piped unsandboxed commands', async () => {
        const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
        await sandboxService.getSandboxConfigPath();
        strictEqual(sandboxService.wrapCommand('echo test | cat', true, 'bash').command, `env TMPDIR="${sandboxService.getTempDir()?.path}" 'bash' -c 'echo test | cat'`);
    });
    test('should preserve trailing backslashes for unsandboxed commands', async () => {
        const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
        await sandboxService.getSandboxConfigPath();
        strictEqual(sandboxService.wrapCommand('echo test \\', true, 'bash').command, `env TMPDIR="${sandboxService.getTempDir()?.path}" 'bash' -c 'echo test \\'`);
    });
    test('should use fish-compatible wrapping for unsandboxed commands', async () => {
        const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
        await sandboxService.getSandboxConfigPath();
        strictEqual(sandboxService.wrapCommand('echo test', true, 'fish').command, `env TMPDIR="${sandboxService.getTempDir()?.path}" 'fish' -c 'echo test'`);
    });
    test('should switch to unsandboxed execution when a domain is not allowlisted', async () => {
        const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
        await sandboxService.getSandboxConfigPath();
        const wrapResult = sandboxService.wrapCommand('curl https://example.com', false, 'bash');
        strictEqual(wrapResult.isSandboxWrapped, false, 'Blocked domains should prevent sandbox wrapping');
        strictEqual(wrapResult.requiresUnsandboxConfirmation, true, 'Blocked domains should require unsandbox confirmation');
        deepStrictEqual(wrapResult.blockedDomains, ['example.com']);
        strictEqual(wrapResult.command, `env TMPDIR="${sandboxService.getTempDir()?.path}" 'bash' -c 'curl https://example.com'`);
    });
    test('should allow exact allowlisted domains', async () => {
        configurationService.setUserConfiguration("chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */, ['example.com']);
        const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
        await sandboxService.getSandboxConfigPath();
        const wrapResult = sandboxService.wrapCommand('curl https://example.com');
        strictEqual(wrapResult.isSandboxWrapped, true, 'Exact allowlisted domains should stay sandboxed');
        strictEqual(wrapResult.blockedDomains, undefined, 'Allowed domains should not be reported as blocked');
    });
    test('should allow wildcard domains', async () => {
        configurationService.setUserConfiguration("chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */, ['*.github.com']);
        const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
        await sandboxService.getSandboxConfigPath();
        const wrapResult = sandboxService.wrapCommand('curl "https://api.github.com/repos/microsoft/vscode"');
        strictEqual(wrapResult.isSandboxWrapped, true, 'Wildcard allowlisted domains should stay sandboxed');
        strictEqual(wrapResult.blockedDomains, undefined, 'Wildcard allowlisted domains should not be reported as blocked');
    });
    test('should give denied domains precedence over allowlisted domains', async () => {
        configurationService.setUserConfiguration("chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */, ['*.github.com']);
        configurationService.setUserConfiguration("chat.agent.sandbox.deniedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkDeniedDomains */, ['api.github.com']);
        const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
        await sandboxService.getSandboxConfigPath();
        const wrapResult = sandboxService.wrapCommand('curl https://api.github.com/repos/microsoft/vscode');
        strictEqual(wrapResult.isSandboxWrapped, false, 'Denied domains should not stay sandboxed');
        deepStrictEqual(wrapResult.blockedDomains, ['api.github.com']);
        deepStrictEqual(wrapResult.deniedDomains, ['api.github.com']);
    });
    test('should match uppercase hostnames when checking allowlisted domains', async () => {
        configurationService.setUserConfiguration("chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */, ['*.github.com']);
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
        configurationService.inspect = (key) => {
            if (key === "chat.agent.sandbox.enabled" /* TerminalChatAgentToolsSettingId.AgentSandboxEnabled */) {
                return {
                    value: undefined,
                    defaultValue: "off" /* TerminalChatAgentToolsSandboxEnabledValue.Off */,
                    userValue: undefined,
                    userLocalValue: undefined,
                    userRemoteValue: undefined,
                    workspaceValue: undefined,
                    workspaceFolderValue: undefined,
                    memoryValue: undefined,
                    policyValue: undefined,
                };
            }
            if (key === "chat.agent.sandbox" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxEnabled */) {
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
                };
            }
            return originalInspect(key);
        };
        const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
        strictEqual(await sandboxService.isEnabled(), false, 'Deprecated settings should not be used when only non-user scopes are set');
    });
    test('should fall back to deprecated chat.agent.sandbox setting in user scope', async () => {
        const originalInspect = configurationService.inspect.bind(configurationService);
        configurationService.inspect = (key) => {
            if (key === "chat.agent.sandbox.enabled" /* TerminalChatAgentToolsSettingId.AgentSandboxEnabled */) {
                return {
                    value: undefined,
                    defaultValue: "off" /* TerminalChatAgentToolsSandboxEnabledValue.Off */,
                    userValue: undefined,
                    userLocalValue: undefined,
                    userRemoteValue: undefined,
                    workspaceValue: undefined,
                    workspaceFolderValue: undefined,
                    memoryValue: undefined,
                    policyValue: undefined,
                };
            }
            if (key === "chat.agent.sandbox" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxEnabled */) {
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
                };
            }
            return originalInspect(key);
        };
        const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
        strictEqual(await sandboxService.isEnabled(), true, 'Deprecated chat.agent.sandbox should still be respected when only the user scope is set');
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
        ok(wrappedCommand.includes(`-c '";echo SANDBOX_ESCAPE_REPRO; # $(uname) \`id\`'`), 'Wrapped command should shell-quote the command argument using single quotes');
        ok(!wrappedCommand.includes(`-c "${command}"`), 'Wrapped command should not embed the command in double quotes');
    });
    test('should keep variable and command substitution payloads literal', async () => {
        const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
        await sandboxService.getSandboxConfigPath();
        const command = 'echo $HOME $(printf literal) `id`';
        const wrappedCommand = sandboxService.wrapCommand(command).command;
        ok(wrappedCommand.includes(`-c 'echo $HOME $(printf literal) \`id\`'`), 'Wrapped command should keep variable and command substitutions inside the quoted argument');
        ok(!wrappedCommand.includes(`-c ${command}`), 'Wrapped command should not pass substitution payloads to -c without quoting');
    });
    test('should detect blocked domains inside command substitutions', async () => {
        const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
        await sandboxService.getSandboxConfigPath();
        const command = 'echo $HOME $(curl eth0.me) `id`';
        const wrapResult = sandboxService.wrapCommand(command, false, 'bash');
        strictEqual(wrapResult.isSandboxWrapped, false, 'Commands with blocked domains inside substitutions should not stay sandboxed');
        strictEqual(wrapResult.requiresUnsandboxConfirmation, true, 'Blocked domains inside substitutions should require confirmation');
        deepStrictEqual(wrapResult.blockedDomains, ['eth0.me']);
        strictEqual(wrapResult.command, `env TMPDIR="${sandboxService.getTempDir()?.path}" 'bash' -c 'echo $HOME $(curl eth0.me) \`id\`'`);
    });
    test('should escape single-quote breakout payloads in wrapped command argument', async () => {
        const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
        await sandboxService.getSandboxConfigPath();
        const command = `';printf breakout; #'`;
        const wrappedCommand = sandboxService.wrapCommand(command).command;
        ok(wrappedCommand.includes(`-c '`), 'Wrapped command should continue to use a single-quoted -c argument');
        ok(wrappedCommand.includes('printf breakout'), 'Wrapped command should preserve the payload text literally');
        ok(!wrappedCommand.includes(`-c '${command}'`), 'Wrapped command should not embed attacker-controlled single quotes without escaping');
        strictEqual((wrappedCommand.match(/\\''/g) ?? []).length, 2, 'Single quote breakout payload should escape each embedded single quote');
    });
    test('should escape embedded single quotes in wrapped command argument', async () => {
        const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
        await sandboxService.getSandboxConfigPath();
        const wrappedCommand = sandboxService.wrapCommand(`echo 'hello'`).command;
        strictEqual((wrappedCommand.match(/\\''/g) ?? []).length, 2, 'Single quote escapes should be inserted for each embedded single quote');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxTYW5kYm94U2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL3Rlc3QvYnJvd3Nlci90ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsRUFBRSxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQzFELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXRHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzNILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3pGLE9BQU8sRUFBb0Msc0JBQXNCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNsSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDaEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDbkcsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMzRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDOUYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDbEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRTNELE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLHdCQUF3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