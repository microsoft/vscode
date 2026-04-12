/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ok, strictEqual } from 'assert';
import { Separator } from '../../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isLinux, isWindows } from '../../../../../../base/common/platform.js';
import { count } from '../../../../../../base/common/strings.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITreeSitterLibraryService } from '../../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { IHistoryService } from '../../../../../services/history/common/history.js';
import { TreeSitterLibraryService } from '../../../../../services/treeSitter/browser/treeSitterLibraryService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { TestIPCFileSystemProvider } from '../../../../../test/electron-browser/workbenchTestServices.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { IChatWidgetService } from '../../../../chat/browser/chat.js';
import { ChatPermissionLevel } from '../../../../chat/common/constants.js';
import { LocalChatSessionUri } from '../../../../chat/common/model/chatUri.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';
import { ILanguageModelToolsService, ToolDataSource, ToolSet } from '../../../../chat/common/tools/languageModelToolsService.js';
import { ITerminalChatService, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { ITerminalProfileResolverService } from '../../../../terminal/common/terminal.js';
import { createRunInTerminalToolData, RunInTerminalTool } from '../../browser/tools/runInTerminalTool.js';
import { terminalChatAgentToolsConfiguration } from '../../common/terminalChatAgentToolsConfiguration.js';
import { TerminalChatService } from '../../../chat/browser/terminalChatService.js';
import { IAgentSessionsService } from '../../../../chat/browser/agentSessions/agentSessionsService.js';
import { isDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ChatAgentToolsContribution } from '../../browser/terminal.chatAgentTools.contribution.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
class TestRunInTerminalTool extends RunInTerminalTool {
    constructor() {
        super(...arguments);
        this._osBackend = Promise.resolve(1 /* OperatingSystem.Windows */);
    }
    get sessionTerminalAssociations() { return this._sessionTerminalAssociations; }
    get sessionTerminalInstances() { return this._sessionTerminalInstances; }
    get profileFetcher() { return this._profileFetcher; }
    get commandLinePresenters() { return this['_commandLinePresenters']; }
    setBackendOs(os) {
        this._osBackend = Promise.resolve(os);
    }
}
suite('RunInTerminalTool', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let configurationService;
    let fileService;
    let storageService;
    let workspaceContextService;
    let terminalServiceDisposeEmitter;
    let chatServiceDisposeEmitter;
    let chatSessionArchivedEmitter;
    let sandboxEnabled;
    let sandboxPrereqResult;
    let terminalSandboxService;
    let createdTerminalInstance;
    let runInTerminalTool;
    setup(() => {
        configurationService = new TestConfigurationService();
        workspaceContextService = new TestContextService();
        const logService = new NullLogService();
        fileService = store.add(new FileService(logService));
        const fileSystemProvider = new TestIPCFileSystemProvider();
        store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
        setConfig("chat.tools.terminal.enableAutoApprove" /* TerminalChatAgentToolsSettingId.EnableAutoApprove */, true);
        setConfig("chat.tools.terminal.blockDetectedFileWrites" /* TerminalChatAgentToolsSettingId.BlockDetectedFileWrites */, 'outsideWorkspace');
        sandboxEnabled = false;
        sandboxPrereqResult = {
            enabled: false,
            sandboxConfigPath: undefined,
            failedCheck: undefined,
        };
        const commandFinishedEmitter = new Emitter();
        const onDisposedEmitter = new Emitter();
        const onDidAddCapabilityEmitter = new Emitter();
        const onDidInputDataEmitter = new Emitter();
        createdTerminalInstance = {
            sendText: async (_text) => {
                // Simulate successful command completion after sendText
                queueMicrotask(() => commandFinishedEmitter.fire({ exitCode: 0 }));
            },
            focus: () => { },
            capabilities: {
                get: (cap) => {
                    if (cap === 2 /* TerminalCapability.CommandDetection */) {
                        return {
                            onCommandFinished: commandFinishedEmitter.event,
                        };
                    }
                    return undefined;
                },
                onDidAddCapability: onDidAddCapabilityEmitter.event,
            },
            onDidInputData: onDidInputDataEmitter.event,
            onDisposed: onDisposedEmitter.event,
        };
        terminalServiceDisposeEmitter = new Emitter();
        chatServiceDisposeEmitter = new Emitter();
        chatSessionArchivedEmitter = new Emitter();
        instantiationService = workbenchInstantiationService({
            configurationService: () => configurationService,
            fileService: () => fileService,
        }, store);
        instantiationService.stub(IChatService, {
            onDidDisposeSession: chatServiceDisposeEmitter.event,
            getSession: () => undefined,
        });
        instantiationService.stub(IAgentSessionsService, {
            onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
            model: {
                onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
            }
        });
        instantiationService.stub(ITerminalChatService, store.add(instantiationService.createInstance(TerminalChatService)));
        instantiationService.stub(IWorkspaceContextService, workspaceContextService);
        instantiationService.stub(IHistoryService, {
            getLastActiveWorkspaceRoot: () => undefined
        });
        terminalSandboxService = {
            _serviceBrand: undefined,
            isEnabled: async () => sandboxEnabled,
            wrapCommand: (command, requestUnsandboxedExecution) => ({
                command: requestUnsandboxedExecution ? `unsandboxed:${command}` : `sandbox:${command}`,
                isSandboxWrapped: !requestUnsandboxedExecution,
            }),
            getSandboxConfigPath: async () => sandboxEnabled ? '/tmp/sandbox.json' : undefined,
            checkForSandboxingPrereqs: async () => sandboxPrereqResult,
            getTempDir: () => undefined,
            setNeedsForceUpdateConfigFile: () => { },
            getOS: async () => 3 /* OperatingSystem.Linux */,
            getResolvedNetworkDomains: () => ({ allowedDomains: [], deniedDomains: [] }),
            getMissingSandboxDependencies: async () => [],
            installMissingSandboxDependencies: async (missingDependencies, _sessionResource, _token, options) => {
                const terminal = await options.createTerminal();
                await options.focusTerminal(terminal);
                await terminal.sendText(`sudo apt install -y ${missingDependencies.join(' ')}`, true);
                return { exitCode: 0 };
            },
        };
        instantiationService.stub(ITerminalSandboxService, terminalSandboxService);
        const treeSitterLibraryService = store.add(instantiationService.createInstance(TreeSitterLibraryService));
        treeSitterLibraryService.isTest = true;
        instantiationService.stub(ITreeSitterLibraryService, treeSitterLibraryService);
        instantiationService.stub(ILanguageModelToolsService, {
            getTools() {
                return [];
            },
        });
        instantiationService.stub(ITerminalService, {
            createTerminal: async () => createdTerminalInstance,
            onDidDisposeInstance: terminalServiceDisposeEmitter.event,
            revealTerminal: async () => { },
            setActiveInstance: () => { },
            setNextCommandId: async () => { }
        });
        instantiationService.stub(ITerminalProfileResolverService, {
            getDefaultProfile: async () => ({ path: 'bash' })
        });
        storageService = instantiationService.get(IStorageService);
        storageService.store("chat.tools.terminal.autoApprove.warningAccepted" /* TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted */, true, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        runInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
    });
    function setAutoApprove(value) {
        setConfig("chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */, value);
    }
    function setConfig(key, value) {
        configurationService.setUserConfiguration(key, value);
        configurationService.onDidChangeConfigurationEmitter.fire({
            affectsConfiguration: () => true,
            affectedKeys: new Set([key]),
            source: 2 /* ConfigurationTarget.USER */,
            change: null,
        });
    }
    function clearAutoApproveWarningAcceptedState() {
        storageService.remove("chat.tools.terminal.autoApprove.warningAccepted" /* TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted */, -1 /* StorageScope.APPLICATION */);
    }
    /**
     * Executes a test scenario for the RunInTerminalTool
     */
    async function executeToolTest(params) {
        const context = {
            parameters: {
                command: 'echo hello',
                explanation: 'Print hello to the console',
                goal: 'Print hello',
                ...params
            }
        };
        const result = await runInTerminalTool.prepareToolInvocation(context, CancellationToken.None);
        return result;
    }
    function isSeparator(action) {
        return action instanceof Separator;
    }
    /**
     * Helper to assert that a command should be auto-approved (no confirmation required)
     */
    function assertAutoApproved(preparedInvocation) {
        ok(preparedInvocation, 'Expected prepared invocation to be defined');
        ok(!preparedInvocation.confirmationMessages, 'Expected no confirmation messages for auto-approved command');
    }
    /**
     * Helper to assert that a command requires confirmation
     */
    function assertConfirmationRequired(preparedInvocation, expectedTitle) {
        ok(preparedInvocation, 'Expected prepared invocation to be defined');
        ok(preparedInvocation.confirmationMessages, 'Expected confirmation messages for non-approved command');
        if (expectedTitle) {
            strictEqual(preparedInvocation.confirmationMessages.title, expectedTitle);
        }
    }
    suite('sandbox invocation messaging', () => {
        test('should instruct models to use $TMPDIR instead of /tmp when sandboxed', async () => {
            sandboxEnabled = true;
            const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
            ok(toolData.modelDescription?.includes('must utilize the $TMPDIR environment variable'), 'Expected sandboxed tool description to require $TMPDIR usage');
            ok(toolData.modelDescription?.includes('The /tmp directory is not guaranteed to be accessible or writable and must be avoided'), 'Expected sandboxed tool description to discourage /tmp usage');
        });
        test('should include requestUnsandboxedExecution in schema when sandbox is enabled', async () => {
            sandboxEnabled = true;
            const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
            const properties = toolData.inputSchema?.properties;
            ok(properties?.['requestUnsandboxedExecution'], 'Expected requestUnsandboxedExecution in schema when sandbox is enabled');
            ok(properties?.['requestUnsandboxedExecutionReason'], 'Expected requestUnsandboxedExecutionReason in schema when sandbox is enabled');
        });
        test('should not include requestUnsandboxedExecution in schema when sandbox is disabled', async () => {
            sandboxEnabled = false;
            const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
            const properties = toolData.inputSchema?.properties;
            ok(!properties?.['requestUnsandboxedExecution'], 'Expected no requestUnsandboxedExecution in schema when sandbox is disabled');
            ok(!properties?.['requestUnsandboxedExecutionReason'], 'Expected no requestUnsandboxedExecutionReason in schema when sandbox is disabled');
        });
        test('should reflect sandbox setting changes in tool data', async () => {
            sandboxEnabled = false;
            const toolDataBefore = await instantiationService.invokeFunction(createRunInTerminalToolData);
            const propertiesBefore = toolDataBefore.inputSchema?.properties;
            ok(!propertiesBefore?.['requestUnsandboxedExecution'], 'Expected no requestUnsandboxedExecution before enabling sandbox');
            sandboxEnabled = true;
            sandboxPrereqResult = {
                enabled: true,
                sandboxConfigPath: '/tmp/sandbox.json',
                failedCheck: undefined,
            };
            const toolDataAfter = await instantiationService.invokeFunction(createRunInTerminalToolData);
            const propertiesAfter = toolDataAfter.inputSchema?.properties;
            ok(propertiesAfter?.['requestUnsandboxedExecution'], 'Expected requestUnsandboxedExecution after enabling sandbox');
            ok(toolDataAfter.modelDescription?.includes('Sandboxing:'), 'Expected sandbox instructions in description after enabling sandbox');
        });
        test('should show confirmation to install missing sandbox dependencies when prereq check fails', async () => {
            sandboxEnabled = false;
            sandboxPrereqResult = {
                enabled: false,
                sandboxConfigPath: '/tmp/sandbox.json',
                failedCheck: "dependencies" /* TerminalSandboxPrerequisiteCheck.Dependencies */,
                missingDependencies: ['bubblewrap'],
            };
            const result = await executeToolTest({
                command: 'echo hello',
                explanation: 'Print hello',
                goal: 'Print hello'
            });
            // The tool should return confirmation messages for the user
            ok(result, 'Expected prepared invocation to be defined');
            ok(result?.confirmationMessages, 'Expected confirmationMessages when deps are missing');
            ok(result?.confirmationMessages?.customButtons?.length === 2, 'Expected two custom buttons');
            // missingDependencies should be in toolSpecificData so invoke can handle it
            strictEqual(result?.toolSpecificData?.missingSandboxDependencies?.length, 1);
        });
        test('should include allowed and denied network domains in model description', async () => {
            sandboxEnabled = true;
            terminalSandboxService.getResolvedNetworkDomains = () => ({
                allowedDomains: ['github.com', 'npmjs.org'],
                deniedDomains: ['evil.com'],
            });
            const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
            ok(toolData.modelDescription?.includes('github.com, npmjs.org'), 'Expected allowed domains in description');
            ok(toolData.modelDescription?.includes('evil.com'), 'Expected denied domains in description');
        });
        test('should exclude denied domains from effective allowed list', async () => {
            sandboxEnabled = true;
            terminalSandboxService.getResolvedNetworkDomains = () => ({
                allowedDomains: ['github.com', 'evil.com', 'npmjs.org'],
                deniedDomains: ['evil.com'],
            });
            const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
            ok(toolData.modelDescription?.includes('github.com, npmjs.org'), 'Expected effective allowed list without denied domain');
            ok(!toolData.modelDescription?.includes('accessible in the sandbox (all other network access is blocked): github.com, evil.com'), 'Expected denied domain removed from allowed list');
        });
        test('should use sandbox labels when command is sandbox wrapped', async () => {
            sandboxEnabled = true;
            sandboxPrereqResult = {
                enabled: true,
                sandboxConfigPath: '/tmp/vscode-sandbox-settings.json',
                failedCheck: undefined,
            };
            terminalSandboxService.wrapCommand = (command) => ({
                command: `sandbox-runtime ${command}`,
                isSandboxWrapped: true,
            });
            const preparedInvocation = await executeToolTest({ command: 'echo hello' });
            ok(preparedInvocation, 'Expected prepared invocation to be defined');
            strictEqual(preparedInvocation.invocationMessage.value, 'Running `echo hello` in sandbox');
            const terminalData = preparedInvocation.toolSpecificData;
            strictEqual(terminalData.commandLine.isSandboxWrapped, true);
        });
    });
    suite('default auto-approve rules', () => {
        const defaults = terminalChatAgentToolsConfiguration["chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */].default;
        suiteSetup(() => {
            // Sanity check on entries to make sure that the defaults are actually pulled in
            ok(Object.keys(defaults).length > 50);
        });
        setup(() => {
            setAutoApprove(defaults);
        });
        const autoApprovedTestCases = [
            // Safe commands
            'echo abc',
            'echo "abc"',
            'echo \'abc\'',
            'ls -la',
            'dir',
            'pwd',
            'cat file.txt',
            'head -n 10 file.txt',
            'tail -f log.txt',
            'findstr pattern file.txt',
            'wc -l file.txt',
            'tr a-z A-Z',
            'cut -d: -f1',
            'cmp file1 file2',
            'which node',
            'basename /path/to/file',
            'dirname /path/to/file',
            'realpath .',
            'readlink symlink',
            'stat file.txt',
            'file document.pdf',
            'du -sh folder',
            'df -h',
            'sleep 5',
            'cd /home/user',
            'nl -ba path/to/file.txt',
            // Safe git sub-commands
            'git status',
            'git log --oneline',
            'git show HEAD',
            'git diff main',
            'git grep "TODO"',
            // PowerShell commands
            'Get-ChildItem',
            'Get-Date',
            'Get-Random',
            'Get-Location',
            'Set-Location C:\\Users\\test',
            'Write-Host "Hello"',
            'Write-Output "Test"',
            'Out-String',
            'Split-Path C:\\Users\\test',
            'Join-Path C:\\Users test',
            'Start-Sleep 2',
            // PowerShell safe verbs (regex patterns)
            'Select-Object Name',
            'Measure-Object Length',
            'Compare-Object $a $b',
            'Format-Table',
            'Sort-Object Name',
            // Commands with acceptable arguments
            'column data.txt',
            'date +%Y-%m-%d',
            'find . -name "*.txt"',
            'grep pattern file.txt',
            'rg pattern file.txt',
            'rg --json pattern .',
            'rg -i --color=never "TODO" src/',
            'sed "s/foo/bar/g"',
            'sed -n "1,10p" file.txt',
            'sed -n \'45,80p\' /foo/bar/Example.java',
            'sed -n \'45,80p\' extensions/markdown-language-features/src/test/copyFile.test.ts',
            'sort file.txt',
            'tree directory',
            // od
            'od somefile',
            'od -A x somefile',
            // xxd
            'xxd',
            'xxd somefile',
            'xxd -l100 somefile',
            'xxd -r somefile',
            'xxd -rp somefile',
            // docker readonly sub-commands
            'docker ps',
            'docker ps -a',
            'docker images',
            'docker info',
            'docker version',
            'docker inspect mycontainer',
            'docker logs mycontainer',
            'docker top mycontainer',
            'docker stats',
            'docker port mycontainer',
            'docker diff mycontainer',
            'docker search nginx',
            'docker events',
            'docker container ls',
            'docker container ps',
            'docker container inspect mycontainer',
            'docker image ls',
            'docker image history myimage',
            'docker image inspect myimage',
            'docker network ls',
            'docker network inspect mynetwork',
            'docker volume ls',
            'docker volume inspect myvolume',
            'docker context ls',
            'docker context inspect mycontext',
            'docker context show',
            'docker system df',
            'docker system info',
            'docker compose ps',
            'docker compose ls',
            'docker compose top',
            'docker compose logs',
            'docker compose images',
            'docker compose config',
            'docker compose version',
            'docker compose port',
            'docker compose events',
        ];
        const confirmationRequiredTestCases = [
            // git log file output
            'git log --output=log.txt',
            // Dangerous file operations
            'rm README.md',
            'rmdir folder',
            'del file.txt',
            'Remove-Item file.txt',
            'ri file.txt',
            'rd folder',
            'erase file.txt',
            'dd if=/dev/zero of=file',
            // Process management
            'kill 1234',
            'ps aux',
            'top',
            'Stop-Process -Id 1234',
            'spps notepad',
            'taskkill /f /im notepad.exe',
            'taskkill.exe /f /im cmd.exe',
            // Web requests
            'curl https://example.com',
            'wget https://example.com/file',
            'Invoke-RestMethod https://api.example.com',
            'Invoke-WebRequest https://example.com',
            'irm https://example.com',
            'iwr https://example.com',
            // File permissions
            'chmod 755 file.sh',
            'chown user:group file.txt',
            'Set-ItemProperty file.txt IsReadOnly $true',
            'sp file.txt IsReadOnly $true',
            'Set-Acl file.txt $acl',
            // Command execution
            'jq \'.name\' file.json',
            'xargs rm',
            'eval "echo hello"',
            'Invoke-Expression "Get-Date"',
            'iex "Write-Host test"',
            // Commands with dangerous arguments
            'column -c 10000 file.txt',
            'date --set="2023-01-01"',
            'find . -delete',
            'find . -exec rm {} \\;',
            'find . -execdir rm {} \\;',
            'find . -fprint output.txt',
            'rg --pre cat pattern .',
            'rg --hostname-bin hostname pattern .',
            'sed --in-place "s/foo/bar/" file.txt',
            'sed -e "s/a/b/" file.txt',
            'sed -f script.sed file.txt',
            'sed --expression "s/a/b/" file.txt',
            'sed --file script.sed file.txt',
            'sed "s/foo/bar/e" file.txt',
            'sed "s/foo/bar/w output.txt" file.txt',
            'sed ";W output.txt" file.txt',
            'sort -o /etc/passwd file.txt',
            'sort -S 100G file.txt',
            'tree -o output.txt',
            // Transient environment variables
            'ls="test" curl https://api.example.com',
            'API_KEY=secret curl https://api.example.com',
            'HTTP_PROXY=proxy:8080 wget https://example.com',
            'VAR1=value1 VAR2=value2 echo test',
            'A=1 B=2 C=3 ./script.sh',
            // xxd with outfile or ambiguous args
            'xxd infile outfile',
            'xxd -l 100 somefile',
            // docker write/execute sub-commands
            'docker run nginx',
            'docker exec mycontainer bash',
            'docker rm mycontainer',
            'docker rmi myimage',
            'docker build .',
            'docker push myimage',
            'docker pull nginx',
            'docker compose up',
            'docker compose down',
        ];
        suite.skip('auto approved', () => {
            for (const command of autoApprovedTestCases) {
                test(command.replaceAll('\n', '\\n'), async () => {
                    assertAutoApproved(await executeToolTest({ command }));
                });
            }
        });
        suite('confirmation required', () => {
            for (const command of confirmationRequiredTestCases) {
                test(command.replaceAll('\n', '\\n'), async () => {
                    assertConfirmationRequired(await executeToolTest({ command }));
                });
            }
        });
    });
    suite('sandbox bypass requests', () => {
        test('should mention denied domains when sandbox denies network access explicitly', async () => {
            sandboxEnabled = true;
            sandboxPrereqResult = {
                enabled: true,
                sandboxConfigPath: '/tmp/sandbox.json',
                failedCheck: undefined,
            };
            runInTerminalTool.setBackendOs(3 /* OperatingSystem.Linux */);
            terminalSandboxService.wrapCommand = (command) => ({
                command: `unsandboxed:${command}`,
                isSandboxWrapped: false,
                requiresUnsandboxConfirmation: true,
                blockedDomains: ['evil.com'],
                deniedDomains: ['evil.com'],
            });
            const result = await executeToolTest({ command: 'curl https://evil.com' });
            assertConfirmationRequired(result, 'Run `bash` command outside the [sandbox](https://aka.ms/vscode-sandboxing) to access `evil.com`?');
            const confirmationMessage = result?.confirmationMessages?.message;
            ok(confirmationMessage && typeof confirmationMessage !== 'string');
            if (!confirmationMessage || typeof confirmationMessage === 'string') {
                throw new Error('Expected markdown confirmation message');
            }
            ok(confirmationMessage.value.includes('Reason for leaving the sandbox: This command accesses evil.com, which is blocked by chat.agent.sandbox.deniedNetworkDomains.'));
        });
        test('should force confirmation for explicit unsandboxed execution requests', async () => {
            sandboxEnabled = true;
            sandboxPrereqResult = {
                enabled: true,
                sandboxConfigPath: '/tmp/sandbox.json',
                failedCheck: undefined,
            };
            runInTerminalTool.setBackendOs(3 /* OperatingSystem.Linux */);
            const result = await executeToolTest({
                requestUnsandboxedExecution: true,
                requestUnsandboxedExecutionReason: 'Needs network access outside the sandbox',
            });
            assertConfirmationRequired(result, 'Run `bash` command outside the [sandbox](https://aka.ms/vscode-sandboxing)?');
            strictEqual(result?.confirmationMessages?.allowAutoConfirm, undefined);
            const terminalData = result?.toolSpecificData;
            strictEqual(terminalData.requestUnsandboxedExecution, true);
            strictEqual(terminalData.requestUnsandboxedExecutionReason, 'Needs network access outside the sandbox');
            strictEqual(terminalData.commandLine.toolEdited, 'unsandboxed:echo hello');
            const confirmationMessage = result?.confirmationMessages?.message;
            ok(confirmationMessage && typeof confirmationMessage !== 'string');
            if (!confirmationMessage || typeof confirmationMessage === 'string') {
                throw new Error('Expected markdown confirmation message');
            }
            ok(confirmationMessage.value.includes('Reason for leaving the sandbox: Needs network access outside the sandbox'));
            strictEqual(result?.confirmationMessages?.disclaimer, undefined);
            const actions = result?.confirmationMessages?.terminalCustomActions;
            ok(actions, 'Expected custom actions to be defined');
            strictEqual(actions.length, 11);
            ok(!isSeparator(actions[0]));
            strictEqual(actions[0].label, 'Allow `unsandboxed:echo …` in this Session');
            ok(!isSeparator(actions[4]));
            strictEqual(actions[4].label, 'Allow Exact Command Line in this Session');
            ok(!isSeparator(actions[10]));
            strictEqual(actions[10].label, 'Configure Auto Approve...');
        });
    });
    suite('prepareToolInvocation - auto approval behavior', () => {
        test('should auto-approve commands in allow list', async () => {
            setAutoApprove({
                echo: true
            });
            const result = await executeToolTest({ command: 'echo hello world' });
            assertAutoApproved(result);
        });
        test('should require confirmation for commands not in allow list', async () => {
            setAutoApprove({
                ls: true
            });
            const result = await executeToolTest({
                command: 'rm file.txt',
                explanation: 'Remove a file',
                goal: 'Remove a file'
            });
            assertConfirmationRequired(result, 'Run `bash` command?');
        });
        test('should require confirmation for commands in deny list even if in allow list', async () => {
            setAutoApprove({
                rm: false,
                echo: true
            });
            const result = await executeToolTest({
                command: 'rm dangerous-file.txt',
                explanation: 'Remove a dangerous file',
                goal: 'Remove a dangerous file'
            });
            assertConfirmationRequired(result, 'Run `bash` command?');
        });
        test('should handle background commands with confirmation', async () => {
            setAutoApprove({
                ls: true
            });
            const result = await executeToolTest({
                command: 'npm run watch',
                explanation: 'Start watching for file changes',
                goal: 'Start watching for file changes',
                mode: 'async'
            });
            assertConfirmationRequired(result, 'Run `bash` command?');
        });
        test('should support legacy isBackground input as async mode', async () => {
            setAutoApprove({
                ls: true
            });
            const result = await executeToolTest({
                command: 'npm run watch',
                explanation: 'Start watching for file changes',
                goal: 'Start watching for file changes',
                isBackground: true
            });
            assertConfirmationRequired(result, 'Run `bash` command?');
        });
        test('should auto-approve background commands in allow list', async () => {
            setAutoApprove({
                npm: true
            });
            const result = await executeToolTest({
                command: 'npm run watch',
                explanation: 'Start watching for file changes',
                goal: 'Start watching for file changes',
                mode: 'async'
            });
            assertAutoApproved(result);
        });
        test('should include auto-approve info for background commands', async () => {
            setAutoApprove({
                npm: true
            });
            const result = await executeToolTest({
                command: 'npm run watch',
                explanation: 'Start watching for file changes',
                goal: 'Start watching for file changes',
                mode: 'async'
            });
            assertAutoApproved(result);
            // Verify that auto-approve information is included
            ok(result?.toolSpecificData, 'Expected toolSpecificData to be defined');
            const terminalData = result.toolSpecificData;
            ok(terminalData.autoApproveInfo, 'Expected autoApproveInfo to be defined for auto-approved background command');
            ok(terminalData.autoApproveInfo.value, 'Expected autoApproveInfo to have a value');
            ok(terminalData.autoApproveInfo.value.includes('npm'), 'Expected autoApproveInfo to mention the approved rule');
        });
        test('should handle regex patterns in allow list', async () => {
            setAutoApprove({
                '/^git (status|log)/': true
            });
            const result = await executeToolTest({ command: 'git status --porcelain' });
            assertAutoApproved(result);
        });
        test('should handle complex command chains with sub-commands', async () => {
            setAutoApprove({
                echo: true,
                ls: true
            });
            const result = await executeToolTest({ command: 'echo "hello" && ls -la' });
            assertAutoApproved(result);
        });
        test('should require confirmation when one sub-command is not approved', async () => {
            setAutoApprove({
                echo: true
            });
            const result = await executeToolTest({ command: 'echo "hello" && rm file.txt' });
            assertConfirmationRequired(result);
        });
        test('should handle empty command strings', async () => {
            setAutoApprove({
                echo: true
            });
            const result = await executeToolTest({
                command: '',
                explanation: 'Empty command',
                goal: 'Empty command'
            });
            assertAutoApproved(result);
        });
        test('should handle matchCommandLine: true patterns', async () => {
            setAutoApprove({
                '/dangerous/': { approve: false, matchCommandLine: true },
                'echo': { approve: true, matchCommandLine: true }
            });
            const result1 = await executeToolTest({ command: 'echo hello world' });
            assertAutoApproved(result1);
            const result2 = await executeToolTest({ command: 'echo this is a dangerous command' });
            assertConfirmationRequired(result2);
        });
        test('should only approve when neither sub-commands or command lines are denied', async () => {
            setAutoApprove({
                'foo': true,
                '/^foo$/': { approve: false, matchCommandLine: true },
            });
            const result1 = await executeToolTest({ command: 'foo' });
            assertConfirmationRequired(result1);
            const result2 = await executeToolTest({ command: 'foo bar' });
            assertAutoApproved(result2);
        });
    });
    suite('confirmation title with presentation overrides', () => {
        function injectMockPresenter(tool, languageDisplayName) {
            // Inject a mock presenter at the start that always returns a result
            tool.commandLinePresenters.unshift({
                present: (options) => ({
                    commandLine: options.commandLine.forDisplay,
                    processOtherPresenters: false,
                    languageDisplayName,
                }),
            });
        }
        test('should use withoutLanguage title when presenter returns no languageDisplayName', async () => {
            injectMockPresenter(runInTerminalTool);
            const result = await executeToolTest({
                command: 'rm file.txt',
                explanation: 'Remove a file',
                goal: 'Remove a file'
            });
            assertConfirmationRequired(result, 'Run command in `bash`?');
        });
        test('should use withoutLanguage background title when presenter returns no languageDisplayName', async () => {
            injectMockPresenter(runInTerminalTool);
            const result = await executeToolTest({
                command: 'npm run watch',
                explanation: 'Start watching',
                goal: 'Start watching',
                mode: 'async'
            });
            assertConfirmationRequired(result, 'Run command in `bash`?');
        });
        test('should use withLanguage title when presenter returns languageDisplayName', async () => {
            const result = await executeToolTest({
                command: 'node -e "console.log(1)"',
                explanation: 'Run node command',
                goal: 'Run node command'
            });
            assertConfirmationRequired(result, 'Run `Node.js` command in `bash`?');
        });
        test('should use withLanguage background title when presenter returns languageDisplayName', async () => {
            const result = await executeToolTest({
                command: 'node -e "console.log(1)"',
                explanation: 'Run node command',
                goal: 'Run node command',
                mode: 'async'
            });
            assertConfirmationRequired(result, 'Run `Node.js` command in `bash`?');
        });
        test('should use withoutLanguage inDirectory title when presenter returns no languageDisplayName with cd prefix', async () => {
            const workspaceFolder = URI.file(isWindows ? 'C:\\workspace\\project' : '/workspace/project');
            const workspace = new Workspace('test', [toWorkspaceFolder(workspaceFolder)]);
            workspaceContextService.setWorkspace(workspace);
            instantiationService.stub(IHistoryService, {
                getLastActiveWorkspaceRoot: () => workspaceFolder
            });
            const toolWithWorkspace = store.add(instantiationService.createInstance(TestRunInTerminalTool));
            injectMockPresenter(toolWithWorkspace);
            const context = {
                parameters: {
                    command: 'cd /tmp && rm file.txt',
                    explanation: 'Remove a file in /tmp',
                    goal: 'Remove a file in /tmp',
                    mode: 'sync',
                    timeout: 30000,
                }
            };
            const result = await toolWithWorkspace.prepareToolInvocation(context, CancellationToken.None);
            assertConfirmationRequired(result, `Run command in \`bash\` within \`${isWindows ? '\\tmp' : '~/tmp'}\`?`);
        });
        test('should use withLanguage inDirectory title when presenter returns languageDisplayName with cd prefix', async () => {
            const workspaceFolder = URI.file(isWindows ? 'C:\\workspace\\project' : '/workspace/project');
            const workspace = new Workspace('test', [toWorkspaceFolder(workspaceFolder)]);
            workspaceContextService.setWorkspace(workspace);
            instantiationService.stub(IHistoryService, {
                getLastActiveWorkspaceRoot: () => workspaceFolder
            });
            const toolWithWorkspace = store.add(instantiationService.createInstance(TestRunInTerminalTool));
            const context = {
                parameters: {
                    command: 'cd /tmp && node -e "console.log(1)"',
                    explanation: 'Run node command in /tmp',
                    goal: 'Run node command in /tmp',
                    mode: 'sync',
                    timeout: 30000,
                }
            };
            const result = await toolWithWorkspace.prepareToolInvocation(context, CancellationToken.None);
            assertConfirmationRequired(result, `Run \`Node.js\` command in \`bash\` within \`${isWindows ? '\\tmp' : '~/tmp'}\`?`);
        });
    });
    suite('prepareToolInvocation - custom actions for dropdown', () => {
        function assertDropdownActions(result, items) {
            const actions = result?.confirmationMessages?.terminalCustomActions;
            ok(actions, 'Expected custom actions to be defined');
            strictEqual(actions.length, items.length);
            for (const [i, item] of items.entries()) {
                const action = actions[i];
                if (item === '---') {
                    ok(isSeparator(action));
                }
                else {
                    ok(!isSeparator(action));
                    if (item === 'configure') {
                        strictEqual(action.label, 'Configure Auto Approve...');
                        strictEqual(action.data.type, 'configure');
                    }
                    else if (item === 'sessionApproval') {
                        strictEqual(action.label, 'Allow All Commands in this Session');
                        strictEqual(action.data.type, 'sessionApproval');
                    }
                    else if (hasKey(item, { commandLine: true })) {
                        const expectedLabel = item.scope === 'session' ? 'Allow Exact Command Line in this Session'
                            : item.scope === 'workspace' ? 'Allow Exact Command Line in this Workspace'
                                : 'Always Allow Exact Command Line';
                        strictEqual(action.label, expectedLabel);
                        strictEqual(action.data.type, 'newRule');
                        ok(!Array.isArray(action.data.rule), 'Expected rule to be an object');
                    }
                    else {
                        const subCommandLabel = Array.isArray(item.subCommand)
                            ? `Commands ${item.subCommand.map(e => `\`${e} \u2026\``).join(', ')}`
                            : `\`${item.subCommand} \u2026\``;
                        const expectedLabel = item.scope === 'session' ? `Allow ${subCommandLabel} in this Session`
                            : item.scope === 'workspace' ? `Allow ${subCommandLabel} in this Workspace`
                                : `Always Allow ${subCommandLabel}`;
                        strictEqual(action.label, expectedLabel);
                        strictEqual(action.data.type, 'newRule');
                        ok(Array.isArray(action.data.rule), 'Expected rule to be an array');
                    }
                }
            }
        }
        test('should generate custom actions for non-auto-approved commands', async () => {
            setAutoApprove({
                ls: true,
            });
            const result = await executeToolTest({
                command: 'npm run build',
                explanation: 'Build the project',
                goal: 'Build the project'
            });
            assertConfirmationRequired(result, 'Run `bash` command?');
            assertDropdownActions(result, [
                { subCommand: 'npm run build', scope: 'session' },
                { subCommand: 'npm run build', scope: 'workspace' },
                { subCommand: 'npm run build', scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should generate custom actions for single word commands', async () => {
            const result = await executeToolTest({
                command: 'foo',
                explanation: 'Run foo command',
                goal: 'Run foo command'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                { subCommand: 'foo', scope: 'session' },
                { subCommand: 'foo', scope: 'workspace' },
                { subCommand: 'foo', scope: 'user' },
                '---',
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should not generate custom actions for auto-approved commands', async () => {
            setAutoApprove({
                npm: true
            });
            const result = await executeToolTest({
                command: 'npm run build',
                explanation: 'Build the project',
                goal: 'Build the project'
            });
            assertAutoApproved(result);
        });
        test('should only generate configure action for explicitly denied commands', async () => {
            setAutoApprove({
                npm: { approve: false }
            });
            const result = await executeToolTest({
                command: 'npm run build',
                explanation: 'Build the project',
                goal: 'Build the project'
            });
            assertConfirmationRequired(result, 'Run `bash` command?');
            assertDropdownActions(result, [
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should handle && in command line labels with proper mnemonic escaping', async () => {
            const result = await executeToolTest({
                command: 'npm install && npm run build',
                explanation: 'Install dependencies and build',
                goal: 'Install dependencies and build'
            });
            assertConfirmationRequired(result, 'Run `bash` command?');
            assertDropdownActions(result, [
                { subCommand: ['npm install', 'npm run build'], scope: 'session' },
                { subCommand: ['npm install', 'npm run build'], scope: 'workspace' },
                { subCommand: ['npm install', 'npm run build'], scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should not show approved commands in custom actions dropdown', async () => {
            setAutoApprove({
                head: true // head is approved by default in real scenario
            });
            const result = await executeToolTest({
                command: 'foo | head -20',
                explanation: 'Run foo command and show first 20 lines',
                goal: 'Run foo command and show first 20 lines'
            });
            assertConfirmationRequired(result, 'Run `bash` command?');
            assertDropdownActions(result, [
                { subCommand: 'foo', scope: 'session' },
                { subCommand: 'foo', scope: 'workspace' },
                { subCommand: 'foo', scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should not show any command-specific actions when all sub-commands are approved', async () => {
            setAutoApprove({
                foo: true,
                head: true
            });
            const result = await executeToolTest({
                command: 'foo | head -20',
                explanation: 'Run foo command and show first 20 lines',
                goal: 'Run foo command and show first 20 lines'
            });
            assertAutoApproved(result);
        });
        test('should handle mixed approved and unapproved commands correctly', async () => {
            setAutoApprove({
                head: true,
                tail: true
            });
            const result = await executeToolTest({
                command: 'foo | head -20 && bar | tail -10',
                explanation: 'Run multiple piped commands',
                goal: 'Run multiple piped commands'
            });
            assertConfirmationRequired(result, 'Run `bash` command?');
            assertDropdownActions(result, [
                { subCommand: ['foo', 'bar'], scope: 'session' },
                { subCommand: ['foo', 'bar'], scope: 'workspace' },
                { subCommand: ['foo', 'bar'], scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should suggest subcommand for git commands', async () => {
            const result = await executeToolTest({
                command: 'git status',
                explanation: 'Check git status',
                goal: 'Check git status'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                { subCommand: 'git status', scope: 'session' },
                { subCommand: 'git status', scope: 'workspace' },
                { subCommand: 'git status', scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should suggest subcommand for npm commands', async () => {
            const result = await executeToolTest({
                command: 'npm test',
                explanation: 'Run npm tests',
                goal: 'Run npm tests'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                { subCommand: 'npm test', scope: 'session' },
                { subCommand: 'npm test', scope: 'workspace' },
                { subCommand: 'npm test', scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should suggest 3-part subcommand for npm run commands', async () => {
            const result = await executeToolTest({
                command: 'npm run build',
                explanation: 'Run build script',
                goal: 'Run build script'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                { subCommand: 'npm run build', scope: 'session' },
                { subCommand: 'npm run build', scope: 'workspace' },
                { subCommand: 'npm run build', scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should suggest 3-part subcommand for yarn run commands', async () => {
            const result = await executeToolTest({
                command: 'yarn run test',
                explanation: 'Run test script',
                goal: 'Run test script'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                { subCommand: 'yarn run test', scope: 'session' },
                { subCommand: 'yarn run test', scope: 'workspace' },
                { subCommand: 'yarn run test', scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should not suggest subcommand for commands with flags', async () => {
            const result = await executeToolTest({
                command: 'foo --foo --bar',
                explanation: 'Run foo with flags',
                goal: 'Run foo with flags'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                { subCommand: 'foo', scope: 'session' },
                { subCommand: 'foo', scope: 'workspace' },
                { subCommand: 'foo', scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should not suggest subcommand for npm run with flags', async () => {
            const result = await executeToolTest({
                command: 'npm run abc --some-flag',
                explanation: 'Run npm run abc with flags',
                goal: 'Run npm run abc with flags'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                { subCommand: 'npm run abc', scope: 'session' },
                { subCommand: 'npm run abc', scope: 'workspace' },
                { subCommand: 'npm run abc', scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should handle mixed npm run and other commands', async () => {
            const result = await executeToolTest({
                command: 'npm run build && git status',
                explanation: 'Build and check status',
                goal: 'Build and check status'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                { subCommand: ['npm run build', 'git status'], scope: 'session' },
                { subCommand: ['npm run build', 'git status'], scope: 'workspace' },
                { subCommand: ['npm run build', 'git status'], scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should suggest mixed subcommands and base commands', async () => {
            const result = await executeToolTest({
                command: 'git push && echo "done"',
                explanation: 'Push and print done',
                goal: 'Push and print done'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                { subCommand: ['git push', 'echo'], scope: 'session' },
                { subCommand: ['git push', 'echo'], scope: 'workspace' },
                { subCommand: ['git push', 'echo'], scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should suggest subcommands for multiple git commands', async () => {
            const result = await executeToolTest({
                command: 'git status && git log --oneline',
                explanation: 'Check status and log',
                goal: 'Check status and log'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                { subCommand: ['git status', 'git log'], scope: 'session' },
                { subCommand: ['git status', 'git log'], scope: 'workspace' },
                { subCommand: ['git status', 'git log'], scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should suggest base command for non-subcommand tools', async () => {
            const result = await executeToolTest({
                command: 'foo bar',
                explanation: 'Download from example.com',
                goal: 'Download from example.com'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                { subCommand: 'foo', scope: 'session' },
                { subCommand: 'foo', scope: 'workspace' },
                { subCommand: 'foo', scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should handle single word commands from subcommand-aware tools', async () => {
            const result = await executeToolTest({
                command: 'git',
                explanation: 'Run git command',
                goal: 'Run git command'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should deduplicate identical subcommand suggestions', async () => {
            const result = await executeToolTest({
                command: 'npm test && npm test --verbose',
                explanation: 'Run tests twice',
                goal: 'Run tests twice'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                { subCommand: 'npm test', scope: 'session' },
                { subCommand: 'npm test', scope: 'workspace' },
                { subCommand: 'npm test', scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should handle flags differently than subcommands for suggestion logic', async () => {
            const result = await executeToolTest({
                command: 'foo --version',
                explanation: 'Check foo version',
                goal: 'Check foo version'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                { subCommand: 'foo', scope: 'session' },
                { subCommand: 'foo', scope: 'workspace' },
                { subCommand: 'foo', scope: 'user' },
                '---',
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should not suggest overly permissive subcommand rules', async () => {
            const result = await executeToolTest({
                command: 'bash -c "echo hello"',
                explanation: 'Run bash command',
                goal: 'Run bash command'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                { commandLine: true, scope: 'session' },
                { commandLine: true, scope: 'workspace' },
                { commandLine: true, scope: 'user' },
                '---',
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should not show command line option when it\'s rejected', async () => {
            setAutoApprove({
                echo: true,
                '/\\(.+\\)/s': { approve: false, matchCommandLine: true }
            });
            const result = await executeToolTest({
                command: 'echo (abc)'
            });
            assertConfirmationRequired(result);
            assertDropdownActions(result, [
                'sessionApproval',
                '---',
                'configure',
            ]);
        });
        test('should prevent auto approval when writing to a file outside the workspace', async () => {
            setConfig("chat.tools.terminal.blockDetectedFileWrites" /* TerminalChatAgentToolsSettingId.BlockDetectedFileWrites */, 'outsideWorkspace');
            setAutoApprove({});
            const workspaceFolder = URI.file(isWindows ? 'C:/workspace/project' : '/workspace/project');
            const workspace = new Workspace('test', [toWorkspaceFolder(workspaceFolder)]);
            workspaceContextService.setWorkspace(workspace);
            instantiationService.stub(IHistoryService, {
                getLastActiveWorkspaceRoot: () => workspaceFolder
            });
            const result = await executeToolTest({
                command: 'echo "abc" > ../file.txt'
            });
            assertConfirmationRequired(result);
            strictEqual(result?.confirmationMessages?.terminalCustomActions, undefined, 'Expected no custom actions when file write is blocked');
        });
    });
    suite('chat session disposal cleanup', () => {
        const createMockTerminal = (processId) => ({
            dispose: () => { },
            processId
        });
        test('should restore all terminals into the session terminal map and dispose them when archived', () => {
            const sessionId = 'test-session-restored-archive';
            const sessionResource = LocalChatSessionUri.forSession(sessionId);
            let terminal1Disposed = false;
            let terminal2Disposed = false;
            const terminal1DisposedEmitter = new Emitter();
            const terminal2DisposedEmitter = new Emitter();
            const mockTerminal1 = {
                dispose: () => {
                    terminal1Disposed = true;
                    terminal1DisposedEmitter.fire();
                },
                onDisposed: terminal1DisposedEmitter.event,
                processId: 55555,
            };
            const mockTerminal2 = {
                dispose: () => {
                    terminal2Disposed = true;
                    terminal2DisposedEmitter.fire();
                },
                onDisposed: terminal2DisposedEmitter.event,
                processId: 66666,
            };
            storageService.store('chat.terminalSessions', JSON.stringify({
                [mockTerminal1.processId]: {
                    sessionId,
                    id: 'restored-1',
                    shellIntegrationQuality: "none" /* ShellIntegrationQuality.None */,
                    isBackground: true,
                },
                [mockTerminal2.processId]: {
                    sessionId,
                    id: 'restored-2',
                    shellIntegrationQuality: "none" /* ShellIntegrationQuality.None */,
                    isBackground: false,
                }
            }), 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
            instantiationService.stub(ITerminalService, {
                onDidDisposeInstance: terminalServiceDisposeEmitter.event,
                instances: [mockTerminal1, mockTerminal2],
                setNextCommandId: async () => { }
            });
            const restoredRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
            const restoredSessionTerminals = restoredRunInTerminalTool.sessionTerminalInstances.get(sessionResource);
            strictEqual(restoredSessionTerminals?.size, 2, 'Both restored terminals should be tracked for the session');
            chatSessionArchivedEmitter.fire({
                resource: sessionResource,
                isArchived: () => true,
            });
            strictEqual(terminal1Disposed, true, 'Restored background terminal should have been disposed');
            strictEqual(terminal2Disposed, true, 'Restored foreground terminal should have been disposed');
            ok(!restoredRunInTerminalTool.sessionTerminalAssociations.has(sessionResource), 'Foreground terminal association should be removed after archive');
            ok(!restoredRunInTerminalTool.sessionTerminalInstances.has(sessionResource), 'All restored terminals for the session should be removed after archive');
        });
        test('should dispose all terminals associated with a single chat session when archived', () => {
            const sessionId = 'test-session-archive';
            const sessionResource = LocalChatSessionUri.forSession(sessionId);
            const mockTerminal1 = { dispose: () => { }, processId: 33333 };
            const mockTerminal2 = { dispose: () => { }, processId: 44444 };
            let terminal1Disposed = false;
            let terminal2Disposed = false;
            mockTerminal1.dispose = () => { terminal1Disposed = true; };
            mockTerminal2.dispose = () => { terminal2Disposed = true; };
            runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
                instance: mockTerminal2,
                shellIntegrationQuality: "none" /* ShellIntegrationQuality.None */
            });
            runInTerminalTool.sessionTerminalInstances.set(sessionResource, new Set([mockTerminal1, mockTerminal2]));
            // Initialize lazy archive listener before firing the archive event.
            const ensureArchivedSessionListener = runInTerminalTool['_ensureArchivedSessionListener'];
            ensureArchivedSessionListener.call(runInTerminalTool);
            chatSessionArchivedEmitter.fire({
                resource: sessionResource,
                isArchived: () => true,
            });
            strictEqual(terminal1Disposed, true, 'Terminal 1 should have been disposed');
            strictEqual(terminal2Disposed, true, 'Terminal 2 should have been disposed');
            ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource), 'Terminal association should be removed after archive');
            ok(!runInTerminalTool.sessionTerminalInstances.has(sessionResource), 'All tracked terminals for the session should be removed after archive');
        });
        test('should not access agent sessions model when initializing archive listener', () => {
            let modelAccessed = false;
            instantiationService.stub(IAgentSessionsService, {
                onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
                get model() {
                    modelAccessed = true;
                    throw new Error('model should not be accessed when wiring archive listener');
                },
            });
            const noModelAccessRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
            const ensureArchivedSessionListener = noModelAccessRunInTerminalTool['_ensureArchivedSessionListener'];
            ensureArchivedSessionListener.call(noModelAccessRunInTerminalTool);
            strictEqual(modelAccessed, false, 'Agent sessions model should not be accessed when initializing archive listener');
        });
        test('should dispose all terminals associated with a single chat session', () => {
            const sessionId = 'test-session-multiple-terminals';
            const mockTerminal1 = createMockTerminal(11111);
            const mockTerminal2 = createMockTerminal(22222);
            let terminal1Disposed = false;
            let terminal2Disposed = false;
            mockTerminal1.dispose = () => { terminal1Disposed = true; };
            mockTerminal2.dispose = () => { terminal2Disposed = true; };
            const sessionResource = LocalChatSessionUri.forSession(sessionId);
            runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
                instance: mockTerminal2,
                shellIntegrationQuality: "none" /* ShellIntegrationQuality.None */
            });
            runInTerminalTool.sessionTerminalInstances.set(sessionResource, new Set([mockTerminal1, mockTerminal2]));
            chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource], reason: 'cleared' });
            strictEqual(terminal1Disposed, true, 'Terminal 1 should have been disposed');
            strictEqual(terminal2Disposed, true, 'Terminal 2 should have been disposed');
            ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource), 'Terminal association should be removed after disposal');
            ok(!runInTerminalTool.sessionTerminalInstances.has(sessionResource), 'All tracked terminals for the session should be removed after disposal');
        });
        test('should dispose associated terminals when chat session is disposed', () => {
            const sessionId = 'test-session-123';
            const mockTerminal = createMockTerminal(12345);
            let terminalDisposed = false;
            mockTerminal.dispose = () => { terminalDisposed = true; };
            const sessionResource = LocalChatSessionUri.forSession(sessionId);
            runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
                instance: mockTerminal,
                shellIntegrationQuality: "none" /* ShellIntegrationQuality.None */
            });
            ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource), 'Terminal association should exist before disposal');
            chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource], reason: 'cleared' });
            strictEqual(terminalDisposed, true, 'Terminal should have been disposed');
            ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource), 'Terminal association should be removed after disposal');
        });
        test('should not affect other sessions when one session is disposed', () => {
            const sessionId1 = 'test-session-1';
            const sessionId2 = 'test-session-2';
            const mockTerminal1 = createMockTerminal(12345);
            const mockTerminal2 = createMockTerminal(67890);
            let terminal1Disposed = false;
            let terminal2Disposed = false;
            mockTerminal1.dispose = () => { terminal1Disposed = true; };
            mockTerminal2.dispose = () => { terminal2Disposed = true; };
            const sessionResource1 = LocalChatSessionUri.forSession(sessionId1);
            const sessionResource2 = LocalChatSessionUri.forSession(sessionId2);
            runInTerminalTool.sessionTerminalAssociations.set(sessionResource1, {
                instance: mockTerminal1,
                shellIntegrationQuality: "none" /* ShellIntegrationQuality.None */
            });
            runInTerminalTool.sessionTerminalAssociations.set(sessionResource2, {
                instance: mockTerminal2,
                shellIntegrationQuality: "none" /* ShellIntegrationQuality.None */
            });
            ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource1), 'Session 1 terminal association should exist');
            ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource2), 'Session 2 terminal association should exist');
            chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource1], reason: 'cleared' });
            strictEqual(terminal1Disposed, true, 'Terminal 1 should have been disposed');
            strictEqual(terminal2Disposed, false, 'Terminal 2 should NOT have been disposed');
            ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource1), 'Session 1 terminal association should be removed');
            ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource2), 'Session 2 terminal association should remain');
        });
        test('should handle disposal of non-existent session gracefully', () => {
            strictEqual(runInTerminalTool.sessionTerminalAssociations.size, 0, 'No associations should exist initially');
            chatServiceDisposeEmitter.fire({ sessionResources: [LocalChatSessionUri.forSession('non-existent-session')], reason: 'cleared' });
            strictEqual(runInTerminalTool.sessionTerminalAssociations.size, 0, 'No associations should exist after handling non-existent session');
        });
    });
    suite('auto approve warning acceptance mechanism', () => {
        test('should require confirmation for auto-approvable commands when warning not accepted', async () => {
            setConfig("chat.tools.terminal.enableAutoApprove" /* TerminalChatAgentToolsSettingId.EnableAutoApprove */, true);
            setAutoApprove({
                echo: true
            });
            clearAutoApproveWarningAcceptedState();
            assertConfirmationRequired(await executeToolTest({ command: 'echo hello world' }), 'Run `bash` command?');
        });
        test('should include autoApproveInfo when command would be auto-approved but warning not accepted', async () => {
            setConfig("chat.tools.terminal.enableAutoApprove" /* TerminalChatAgentToolsSettingId.EnableAutoApprove */, true);
            setAutoApprove({
                echo: true
            });
            clearAutoApproveWarningAcceptedState();
            const result = await executeToolTest({ command: 'echo hello world' });
            assertConfirmationRequired(result, 'Run `bash` command?');
            // autoApproveInfo should be set so the confirmation widget knows to auto-approve
            // after the user accepts the warning modal
            const terminalData = result.toolSpecificData;
            ok(terminalData.autoApproveInfo, 'autoApproveInfo should be set for commands that would be auto-approved');
        });
        test('should auto-approve commands when both auto-approve enabled and warning accepted', async () => {
            setConfig("chat.tools.terminal.enableAutoApprove" /* TerminalChatAgentToolsSettingId.EnableAutoApprove */, true);
            setAutoApprove({
                echo: true
            });
            assertAutoApproved(await executeToolTest({ command: 'echo hello world' }));
        });
        test('should require confirmation when auto-approve disabled regardless of warning acceptance', async () => {
            setConfig("chat.tools.terminal.enableAutoApprove" /* TerminalChatAgentToolsSettingId.EnableAutoApprove */, false);
            setAutoApprove({
                echo: true
            });
            const result = await executeToolTest({ command: 'echo hello world' });
            assertConfirmationRequired(result, 'Run `bash` command?');
        });
    });
    suite('unique rules deduplication', () => {
        test('should properly deduplicate rules with same sourceText in auto-approve info', async () => {
            setAutoApprove({
                echo: true
            });
            const result = await executeToolTest({ command: 'echo hello && echo world' });
            assertAutoApproved(result);
            const autoApproveInfo = result.toolSpecificData.autoApproveInfo;
            ok(autoApproveInfo);
            ok(autoApproveInfo.value.includes('Auto approved by rule '), 'should contain singular "rule", not plural');
            strictEqual(count(autoApproveInfo.value, 'echo'), 1);
        });
    });
    suite('session auto approval', () => {
        test('should auto approve all commands when session has auto approval enabled', async () => {
            const sessionId = 'test-session-123';
            const sessionResource = LocalChatSessionUri.forSession(sessionId);
            const terminalChatService = instantiationService.get(ITerminalChatService);
            const context = {
                parameters: {
                    command: 'rm dangerous-file.txt',
                    explanation: 'Remove a file',
                    goal: 'Remove a file',
                    mode: 'sync',
                    timeout: 30000,
                },
                chatSessionResource: sessionResource
            };
            let result = await runInTerminalTool.prepareToolInvocation(context, CancellationToken.None);
            assertConfirmationRequired(result);
            terminalChatService.setChatSessionAutoApproval(sessionResource, true);
            result = await runInTerminalTool.prepareToolInvocation(context, CancellationToken.None);
            assertAutoApproved(result);
            const terminalData = result.toolSpecificData;
            ok(terminalData.autoApproveInfo, 'Expected autoApproveInfo to be defined');
            ok(terminalData.autoApproveInfo.value.includes('Auto approved for this session'), 'Expected session approval message');
        });
        test('should bypass terminal auto-approve feature in Autopilot mode', async () => {
            setAutoApprove({
                curl: false
            });
            const sessionResource = LocalChatSessionUri.forSession('autopilot-session');
            instantiationService.stub(IChatWidgetService, {
                getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel: ChatPermissionLevel.Autopilot } } })),
                lastFocusedWidget: undefined,
            });
            const autopilotRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
            const result = await autopilotRunInTerminalTool.prepareToolInvocation({
                parameters: {
                    command: 'curl https://example.com',
                    explanation: 'Fetch a URL',
                    goal: 'Download content',
                    mode: 'sync',
                    timeout: 30000,
                },
                chatSessionResource: sessionResource,
            }, CancellationToken.None);
            assertAutoApproved(result);
            const terminalData = result.toolSpecificData;
            strictEqual(terminalData.autoApproveInfo, undefined, 'Expected no terminal auto-approve info in Autopilot mode');
        });
        test('should bypass terminal auto-approve feature in Bypass Approvals mode', async () => {
            setAutoApprove({
                curl: false
            });
            const sessionResource = LocalChatSessionUri.forSession('bypass-session');
            instantiationService.stub(IChatWidgetService, {
                getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove } } })),
                lastFocusedWidget: undefined,
            });
            const bypassRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
            const result = await bypassRunInTerminalTool.prepareToolInvocation({
                parameters: {
                    command: 'curl https://example.com',
                    explanation: 'Fetch a URL',
                    goal: 'Download content',
                    mode: 'sync',
                    timeout: 30000,
                },
                chatSessionResource: sessionResource,
            }, CancellationToken.None);
            assertAutoApproved(result);
            const terminalData = result.toolSpecificData;
            strictEqual(terminalData.autoApproveInfo, undefined, 'Expected no terminal auto-approve info in Bypass Approvals mode');
        });
    });
    suite('TerminalProfileFetcher', () => {
        suite('getCopilotProfile', () => {
            (isWindows ? test : test.skip)('should return custom profile when configured', async () => {
                runInTerminalTool.setBackendOs(1 /* OperatingSystem.Windows */);
                const customProfile = Object.freeze({ path: 'C:\\Windows\\System32\\powershell.exe', args: ['-NoProfile'] });
                setConfig("chat.tools.terminal.terminalProfile.windows" /* TerminalChatAgentToolsSettingId.TerminalProfileWindows */, customProfile);
                const result = await runInTerminalTool.profileFetcher.getCopilotProfile();
                strictEqual(result, customProfile);
            });
            (isLinux ? test : test.skip)('should fall back to default shell when no custom profile is configured', async () => {
                runInTerminalTool.setBackendOs(3 /* OperatingSystem.Linux */);
                setConfig("chat.tools.terminal.terminalProfile.linux" /* TerminalChatAgentToolsSettingId.TerminalProfileLinux */, null);
                const result = await runInTerminalTool.profileFetcher.getCopilotProfile();
                strictEqual(typeof result, 'object');
                strictEqual(result.path, 'bash');
            });
        });
    });
    suite('denial info in disclaimers', () => {
        function getDisclaimerValue(disclaimer) {
            if (!disclaimer) {
                return undefined;
            }
            return typeof disclaimer === 'string' ? disclaimer : disclaimer.value;
        }
        test('should include denial reason in disclaimer when command is denied by rule', async () => {
            setAutoApprove({
                npm: { approve: false }
            });
            const result = await executeToolTest({
                command: 'npm run build',
                explanation: 'Build the project',
                goal: 'Build the project'
            });
            assertConfirmationRequired(result, 'Run `bash` command?');
            const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
            ok(disclaimerValue, 'Expected disclaimer to be defined');
            ok(disclaimerValue.includes('denied'), 'Expected disclaimer to mention denial');
            ok(disclaimerValue.includes('npm'), 'Expected disclaimer to mention the denied rule');
        });
        test('should include link to settings in denial disclaimer', async () => {
            setAutoApprove({
                rm: { approve: false }
            });
            const result = await executeToolTest({
                command: 'rm -rf temp',
                explanation: 'Remove temp folder',
                goal: 'Remove temp folder'
            });
            assertConfirmationRequired(result, 'Run `bash` command?');
            ok(result?.confirmationMessages?.disclaimer, 'Expected disclaimer to be defined');
            // The disclaimer should have trusted commands enabled for settings links
            const disclaimer = result.confirmationMessages.disclaimer;
            ok(typeof disclaimer !== 'string' && disclaimer.isTrusted, 'Expected disclaimer to be trusted for command links');
        });
        test('should include denial reason for multiple denied sub-commands', async () => {
            setAutoApprove({
                rm: { approve: false },
                sudo: { approve: false }
            });
            const result = await executeToolTest({
                command: 'sudo rm -rf /',
                explanation: 'Dangerous command',
                goal: 'Dangerous command'
            });
            assertConfirmationRequired(result, 'Run `bash` command?');
            const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
            ok(disclaimerValue, 'Expected disclaimer to be defined');
            ok(disclaimerValue.includes('denied'), 'Expected disclaimer to mention denial');
        });
        test('should not include denial info when auto-approve is disabled', async () => {
            setConfig("chat.tools.terminal.enableAutoApprove" /* TerminalChatAgentToolsSettingId.EnableAutoApprove */, false);
            setAutoApprove({
                npm: { approve: false }
            });
            const result = await executeToolTest({
                command: 'npm run build',
                explanation: 'Build the project',
                goal: 'Build the project'
            });
            assertConfirmationRequired(result, 'Run `bash` command?');
            // When auto-approve is disabled, there should be no denial-related disclaimer
            const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
            if (disclaimerValue) {
                ok(!disclaimerValue.includes('denied'), 'Should not mention denial when auto-approve is disabled');
            }
        });
        test('should not include denial info for commands that are simply not approved', async () => {
            // Command is not in auto-approve list, but not explicitly denied
            setAutoApprove({
                echo: true
            });
            const result = await executeToolTest({
                command: 'npm run build',
                explanation: 'Build the project',
                goal: 'Build the project'
            });
            assertConfirmationRequired(result, 'Run `bash` command?');
            // There should be no denial disclaimer since npm is not explicitly denied
            const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
            if (disclaimerValue) {
                ok(!disclaimerValue.includes('denied'), 'Should not mention denial for non-denied commands');
            }
        });
    });
    suite('ConfirmTerminalCommandTool', () => {
        test('should require confirmation when sandbox is enabled but sandbox rewriting is disabled', async () => {
            sandboxEnabled = true;
            const { ConfirmTerminalCommandTool } = await import('../../browser/tools/runInTerminalConfirmationTool.js');
            const confirmTool = store.add(instantiationService.createInstance(ConfirmTerminalCommandTool));
            const context = {
                parameters: {
                    command: 'ping google.com',
                    explanation: 'Ping google.com',
                    goal: 'Ping google.com',
                    mode: 'sync',
                    timeout: 30000,
                }
            };
            const result = await confirmTool.prepareToolInvocation(context, CancellationToken.None);
            assertConfirmationRequired(result);
        });
        test('should require confirmation when sandbox is disabled', async () => {
            sandboxEnabled = false;
            setAutoApprove({});
            const { ConfirmTerminalCommandTool } = await import('../../browser/tools/runInTerminalConfirmationTool.js');
            const confirmTool = store.add(instantiationService.createInstance(ConfirmTerminalCommandTool));
            const context = {
                parameters: {
                    command: 'echo hello',
                    explanation: 'Print hello',
                    goal: 'Print hello',
                    mode: 'sync',
                    timeout: 30000,
                }
            };
            const result = await confirmTool.prepareToolInvocation(context, CancellationToken.None);
            assertConfirmationRequired(result);
        });
    });
});
suite('ChatAgentToolsContribution - tool registration refresh', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let configurationService;
    let registeredToolData;
    let sandboxEnabled;
    setup(() => {
        configurationService = new TestConfigurationService();
        registeredToolData = new Map();
        sandboxEnabled = false;
        const logService = new NullLogService();
        const fileService = store.add(new FileService(logService));
        const fileSystemProvider = new TestIPCFileSystemProvider();
        store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
        const terminalServiceDisposeEmitter = store.add(new Emitter());
        const chatServiceDisposeEmitter = store.add(new Emitter());
        const chatSessionArchivedEmitter = store.add(new Emitter());
        instantiationService = workbenchInstantiationService({
            configurationService: () => configurationService,
            fileService: () => fileService,
        }, store);
        instantiationService.stub(IChatService, {
            onDidDisposeSession: chatServiceDisposeEmitter.event,
            getSession: () => undefined,
        });
        instantiationService.stub(IAgentSessionsService, {
            onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
            model: {
                onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
            }
        });
        instantiationService.stub(ITerminalChatService, store.add(instantiationService.createInstance(TerminalChatService)));
        instantiationService.stub(IHistoryService, {
            getLastActiveWorkspaceRoot: () => undefined
        });
        const terminalSandboxService = {
            _serviceBrand: undefined,
            isEnabled: async () => sandboxEnabled,
            wrapCommand: (command) => ({
                command: `sandbox:${command}`,
                isSandboxWrapped: true,
            }),
            getSandboxConfigPath: async () => sandboxEnabled ? '/tmp/sandbox.json' : undefined,
            checkForSandboxingPrereqs: async () => ({ enabled: sandboxEnabled, sandboxConfigPath: sandboxEnabled ? '/tmp/sandbox.json' : undefined, failedCheck: undefined }),
            getTempDir: () => undefined,
            setNeedsForceUpdateConfigFile: () => { },
            getOS: async () => 3 /* OperatingSystem.Linux */,
            getResolvedNetworkDomains: () => ({ allowedDomains: [], deniedDomains: [] }),
            getMissingSandboxDependencies: async () => [],
            installMissingSandboxDependencies: async () => ({ exitCode: 0 }),
        };
        instantiationService.stub(ITerminalSandboxService, terminalSandboxService);
        const treeSitterLibraryService = store.add(instantiationService.createInstance(TreeSitterLibraryService));
        treeSitterLibraryService.isTest = true;
        instantiationService.stub(ITreeSitterLibraryService, treeSitterLibraryService);
        instantiationService.stub(ITerminalService, {
            onDidDisposeInstance: terminalServiceDisposeEmitter.event,
            setNextCommandId: async () => { }
        });
        instantiationService.stub(ITerminalProfileResolverService, {
            getDefaultProfile: async () => ({ path: 'bash' })
        });
        const contextKeyService = instantiationService.get(IContextKeyService);
        const registeredToolImpls = new Map();
        const mockToolsService = {
            _serviceBrand: undefined,
            onDidChangeTools: Event.None,
            registerToolData(toolData) {
                registeredToolData.set(toolData.id, toolData);
                return toDisposable(() => registeredToolData.delete(toolData.id));
            },
            registerToolImplementation(id, tool) {
                registeredToolImpls.set(id, tool);
                return toDisposable(() => registeredToolImpls.delete(id));
            },
            registerTool(toolData, tool) {
                registeredToolData.set(toolData.id, toolData);
                registeredToolImpls.set(toolData.id, tool);
                return toDisposable(() => {
                    registeredToolData.delete(toolData.id);
                    registeredToolImpls.delete(toolData.id);
                    if (isDisposable(tool)) {
                        tool.dispose();
                    }
                });
            },
            getTools() {
                return registeredToolData.values();
            },
            executeToolSet: new ToolSet('execute', 'execute', Codicon.play, ToolDataSource.Internal, undefined, undefined, contextKeyService),
            readToolSet: new ToolSet('read', 'read', Codicon.book, ToolDataSource.Internal, undefined, undefined, contextKeyService),
        };
        instantiationService.stub(ILanguageModelToolsService, mockToolsService);
    });
    async function flushAsync() {
        // Multiple microtask cycles to let async _registerRunInTerminalTool complete
        for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    async function createContribution() {
        const contribution = store.add(instantiationService.createInstance(ChatAgentToolsContribution));
        await flushAsync();
        return contribution;
    }
    test('should register run_in_terminal tool on construction', async () => {
        await createContribution();
        ok(registeredToolData.has("run_in_terminal" /* TerminalToolId.RunInTerminal */), 'Expected run_in_terminal tool to be registered');
    });
    test('should refresh run_in_terminal tool data when sandbox setting changes', async () => {
        await createContribution();
        const toolDataBefore = registeredToolData.get("run_in_terminal" /* TerminalToolId.RunInTerminal */);
        ok(toolDataBefore, 'Expected run_in_terminal tool to be registered');
        const propertiesBefore = toolDataBefore.inputSchema?.properties;
        ok(!propertiesBefore?.['requestUnsandboxedExecution'], 'Expected no requestUnsandboxedExecution before enabling sandbox');
        // Enable sandbox and fire config change
        sandboxEnabled = true;
        configurationService.setUserConfiguration("chat.agent.sandbox.enabled" /* TerminalChatAgentToolsSettingId.AgentSandboxEnabled */, "on" /* TerminalChatAgentToolsSandboxEnabledValue.On */);
        configurationService.onDidChangeConfigurationEmitter.fire({
            affectsConfiguration: (key) => key === "chat.agent.sandbox.enabled" /* TerminalChatAgentToolsSettingId.AgentSandboxEnabled */,
            affectedKeys: new Set(["chat.agent.sandbox.enabled" /* TerminalChatAgentToolsSettingId.AgentSandboxEnabled */]),
            source: 2 /* ConfigurationTarget.USER */,
            change: null,
        });
        // Wait for async registration
        await flushAsync();
        const toolDataAfter = registeredToolData.get("run_in_terminal" /* TerminalToolId.RunInTerminal */);
        ok(toolDataAfter, 'Expected run_in_terminal tool to still be registered');
        const propertiesAfter = toolDataAfter.inputSchema?.properties;
        ok(propertiesAfter?.['requestUnsandboxedExecution'], 'Expected requestUnsandboxedExecution after enabling sandbox');
    });
    test('should refresh run_in_terminal tool data when sandbox network setting changes', async () => {
        sandboxEnabled = true;
        await createContribution();
        const toolDataBefore = registeredToolData.get("run_in_terminal" /* TerminalToolId.RunInTerminal */);
        ok(toolDataBefore, 'Expected run_in_terminal tool to be registered');
        // Fire network config change
        configurationService.onDidChangeConfigurationEmitter.fire({
            affectsConfiguration: (key) => key === "chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */,
            affectedKeys: new Set(["chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */]),
            source: 2 /* ConfigurationTarget.USER */,
            change: null,
        });
        // Wait for async registration
        await flushAsync();
        const toolDataAfter = registeredToolData.get("run_in_terminal" /* TerminalToolId.RunInTerminal */);
        ok(toolDataAfter, 'Expected run_in_terminal tool to still be registered after network setting change');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuSW5UZXJtaW5hbFRvb2wudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvcnVuSW5UZXJtaW5hbFRvb2wudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsRUFBRSxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUN6QyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDckUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDbEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQW1CLE1BQU0sMkNBQTJDLENBQUM7QUFDaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxNQUFNLEVBQXFCLE1BQU0sd0NBQXdDLENBQUM7QUFDbkYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGlGQUFpRixDQUFDO0FBRTVILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBRTVILE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUVyRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUs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