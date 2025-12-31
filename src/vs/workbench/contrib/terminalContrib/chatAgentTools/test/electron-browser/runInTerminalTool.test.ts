/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { Separator } from '../../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isLinux, isWindows, OperatingSystem } from '../../../../../../base/common/platform.js';
import { count } from '../../../../../../base/common/strings.js';
import type { SingleOrMany } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITreeSitterLibraryService } from '../../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ITerminalProfile } from '../../../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { IHistoryService } from '../../../../../services/history/common/history.js';
import { TreeSitterLibraryService } from '../../../../../services/treeSitter/browser/treeSitterLibraryService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { TestIPCFileSystemProvider } from '../../../../../test/electron-browser/workbenchTestServices.js';
import { TerminalToolConfirmationStorageKeys } from '../../../../chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js';
import { IChatService, type IChatTerminalToolInvocationData } from '../../../../chat/common/chatService/chatService.js';
import { LocalChatSessionUri } from '../../../../chat/common/model/chatUri.js';
import { ILanguageModelToolsService, IPreparedToolInvocation, IToolInvocationPreparationContext, type ToolConfirmationAction } from '../../../../chat/common/tools/languageModelToolsService.js';
import { ITerminalChatService, ITerminalService, type ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { ITerminalProfileResolverService } from '../../../../terminal/common/terminal.js';
import { RunInTerminalTool, type IRunInTerminalInputParams } from '../../browser/tools/runInTerminalTool.js';
import { ShellIntegrationQuality } from '../../browser/toolTerminalCreator.js';
import { terminalChatAgentToolsConfiguration, TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { TerminalChatService } from '../../../chat/browser/terminalChatService.js';

class TestRunInTerminalTool extends RunInTerminalTool {
	protected override _osBackend: Promise<OperatingSystem> = Promise.resolve(OperatingSystem.Windows);

	get sessionTerminalAssociations() { return this._sessionTerminalAssociations; }
	get profileFetcher() { return this._profileFetcher; }

	setBackendOs(os: OperatingSystem) {
		this._osBackend = Promise.resolve(os);
	}
}

suite('RunInTerminalTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let fileService: IFileService;
	let storageService: IStorageService;
	let workspaceContextService: TestContextService;
	let terminalServiceDisposeEmitter: Emitter<ITerminalInstance>;
	let chatServiceDisposeEmitter: Emitter<{ sessionResource: URI[]; reason: 'cleared' }>;

	let runInTerminalTool: TestRunInTerminalTool;

	setup(() => {
		configurationService = new TestConfigurationService();
		workspaceContextService = new TestContextService();

		const logService = new NullLogService();
		fileService = store.add(new FileService(logService));
		const fileSystemProvider = new TestIPCFileSystemProvider();
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
		terminalServiceDisposeEmitter = new Emitter<ITerminalInstance>();
		chatServiceDisposeEmitter = new Emitter<{ sessionResource: URI[]; reason: 'cleared' }>();

		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
			fileService: () => fileService,
		}, store);

		instantiationService.stub(ITerminalChatService, store.add(instantiationService.createInstance(TerminalChatService)));
		instantiationService.stub(IWorkspaceContextService, workspaceContextService);
		instantiationService.stub(IHistoryService, {
			getLastActiveWorkspaceRoot: () => undefined
		});

		const treeSitterLibraryService = store.add(instantiationService.createInstance(TreeSitterLibraryService));
		treeSitterLibraryService.isTest = true;
		instantiationService.stub(ITreeSitterLibraryService, treeSitterLibraryService);

		instantiationService.stub(ILanguageModelToolsService, {
			getTools() {
				return [];
			},
		});
		instantiationService.stub(ITerminalService, {
			onDidDisposeInstance: terminalServiceDisposeEmitter.event,
			setNextCommandId: async () => { }
		});
		instantiationService.stub(IChatService, {
			onDidDisposeSession: chatServiceDisposeEmitter.event
		});
		instantiationService.stub(ITerminalProfileResolverService, {
			getDefaultProfile: async () => ({ path: 'bash' } as ITerminalProfile)
		});

		storageService = instantiationService.get(IStorageService);
		storageService.store(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, true, StorageScope.APPLICATION, StorageTarget.USER);

		runInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
	});

	function setAutoApprove(value: { [key: string]: { approve: boolean; matchCommandLine?: boolean } | boolean }) {
		setConfig(TerminalChatAgentToolsSettingId.AutoApprove, value);
	}

	function setConfig(key: string, value: unknown) {
		configurationService.setUserConfiguration(key, value);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: () => true,
			affectedKeys: new Set([key]),
			source: ConfigurationTarget.USER,
			change: null!,
		});
	}

	function clearAutoApproveWarningAcceptedState() {
		storageService.remove(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, StorageScope.APPLICATION);
	}

	/**
	 * Executes a test scenario for the RunInTerminalTool
	 */
	async function executeToolTest(
		params: Partial<IRunInTerminalInputParams>
	): Promise<IPreparedToolInvocation | undefined> {
		const context: IToolInvocationPreparationContext = {
			parameters: {
				command: 'echo hello',
				explanation: 'Print hello to the console',
				isBackground: false,
				...params
			} as IRunInTerminalInputParams
		} as IToolInvocationPreparationContext;

		const result = await runInTerminalTool.prepareToolInvocation(context, CancellationToken.None);
		return result;
	}

	function isSeparator(action: ToolConfirmationAction): action is Separator {
		return action instanceof Separator;
	}

	/**
	 * Helper to assert that a command should be auto-approved (no confirmation required)
	 */
	function assertAutoApproved(preparedInvocation: IPreparedToolInvocation | undefined) {
		ok(preparedInvocation, 'Expected prepared invocation to be defined');
		ok(!preparedInvocation.confirmationMessages, 'Expected no confirmation messages for auto-approved command');
	}

	/**
	 * Helper to assert that a command requires confirmation
	 */
	function assertConfirmationRequired(preparedInvocation: IPreparedToolInvocation | undefined, expectedTitle?: string) {
		ok(preparedInvocation, 'Expected prepared invocation to be defined');
		ok(preparedInvocation.confirmationMessages, 'Expected confirmation messages for non-approved command');
		if (expectedTitle) {
			strictEqual(preparedInvocation.confirmationMessages!.title, expectedTitle);
		}
	}

	suite('default auto-approve rules', () => {
		const defaults = terminalChatAgentToolsConfiguration[TerminalChatAgentToolsSettingId.AutoApprove].default as Record<string, boolean | { approve: boolean; matchCommandLine?: boolean }>;

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
			'Write-Host "Hello"',
			'Write-Output "Test"',
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
			'sort file.txt',
			'tree directory'
		];
		const confirmationRequiredTestCases = [
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
			'sed -i "s/foo/bar/g" file.txt',
			'sed -i.bak "s/foo/bar/" file.txt',
			'sed -Ibak "s/foo/bar/" file.txt',
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
				explanation: 'Remove a file'
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
				explanation: 'Remove a dangerous file'
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
				isBackground: true
			});
			assertConfirmationRequired(result, 'Run `bash` command? (background terminal)');
		});

		test('should auto-approve background commands in allow list', async () => {
			setAutoApprove({
				npm: true
			});

			const result = await executeToolTest({
				command: 'npm run watch',
				explanation: 'Start watching for file changes',
				isBackground: true
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
				isBackground: true
			});
			assertAutoApproved(result);

			// Verify that auto-approve information is included
			ok(result?.toolSpecificData, 'Expected toolSpecificData to be defined');
			// eslint-disable-next-line local/code-no-any-casts
			const terminalData = result!.toolSpecificData as any;
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
				explanation: 'Empty command'
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

	suite('prepareToolInvocation - custom actions for dropdown', () => {

		function assertDropdownActions(result: IPreparedToolInvocation | undefined, items: ({ subCommand: SingleOrMany<string> } | 'commandLine' | '---' | 'configure' | 'sessionApproval')[]) {
			const actions = result?.confirmationMessages?.terminalCustomActions!;
			ok(actions, 'Expected custom actions to be defined');

			strictEqual(actions.length, items.length);

			for (const [i, item] of items.entries()) {
				const action = actions[i];
				if (item === '---') {
					ok(isSeparator(action));
				} else {
					ok(!isSeparator(action));
					if (item === 'configure') {
						strictEqual(action.label, 'Configure Auto Approve...');
						strictEqual(action.data.type, 'configure');
					} else if (item === 'sessionApproval') {
						strictEqual(action.label, 'Allow All Commands in this Session');
						strictEqual(action.data.type, 'sessionApproval');
					} else if (item === 'commandLine') {
						strictEqual(action.label, 'Always Allow Exact Command Line');
						strictEqual(action.data.type, 'newRule');
						ok(!Array.isArray(action.data.rule), 'Expected rule to be an object');
					} else {
						if (Array.isArray(item.subCommand)) {
							strictEqual(action.label, `Always Allow Commands: ${item.subCommand.join(', ')}`);
						} else {
							strictEqual(action.label, `Always Allow Command: ${item.subCommand}`);
						}
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
				explanation: 'Build the project'
			});

			assertConfirmationRequired(result, 'Run `bash` command?');
			assertDropdownActions(result, [
				{ subCommand: 'npm run build' },
				'commandLine',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should generate custom actions for single word commands', async () => {
			const result = await executeToolTest({
				command: 'foo',
				explanation: 'Run foo command'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'foo' },
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
				explanation: 'Build the project'
			});

			assertAutoApproved(result);
		});

		test('should only generate configure action for explicitly denied commands', async () => {
			setAutoApprove({
				npm: { approve: false }
			});
			const result = await executeToolTest({
				command: 'npm run build',
				explanation: 'Build the project'
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
				explanation: 'Install dependencies and build'
			});

			assertConfirmationRequired(result, 'Run `bash` command?');
			assertDropdownActions(result, [
				{ subCommand: ['npm install', 'npm run build'] },
				'commandLine',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should not show approved commands in custom actions dropdown', async () => {
			setAutoApprove({
				head: true  // head is approved by default in real scenario
			});
			const result = await executeToolTest({
				command: 'foo | head -20',
				explanation: 'Run foo command and show first 20 lines'
			});

			assertConfirmationRequired(result, 'Run `bash` command?');
			assertDropdownActions(result, [
				{ subCommand: 'foo' },
				'commandLine',
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
				explanation: 'Run foo command and show first 20 lines'
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
				explanation: 'Run multiple piped commands'
			});

			assertConfirmationRequired(result, 'Run `bash` command?');
			assertDropdownActions(result, [
				{ subCommand: ['foo', 'bar'] },
				'commandLine',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should suggest subcommand for git commands', async () => {
			const result = await executeToolTest({
				command: 'git status',
				explanation: 'Check git status'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'git status' },
				'commandLine',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should suggest subcommand for npm commands', async () => {
			const result = await executeToolTest({
				command: 'npm test',
				explanation: 'Run npm tests'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'npm test' },
				'commandLine',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should suggest 3-part subcommand for npm run commands', async () => {
			const result = await executeToolTest({
				command: 'npm run build',
				explanation: 'Run build script'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'npm run build' },
				'commandLine',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should suggest 3-part subcommand for yarn run commands', async () => {
			const result = await executeToolTest({
				command: 'yarn run test',
				explanation: 'Run test script'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'yarn run test' },
				'commandLine',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should not suggest subcommand for commands with flags', async () => {
			const result = await executeToolTest({
				command: 'foo --foo --bar',
				explanation: 'Run foo with flags'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'foo' },
				'commandLine',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should not suggest subcommand for npm run with flags', async () => {
			const result = await executeToolTest({
				command: 'npm run abc --some-flag',
				explanation: 'Run npm run abc with flags'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'npm run abc' },
				'commandLine',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should handle mixed npm run and other commands', async () => {
			const result = await executeToolTest({
				command: 'npm run build && git status',
				explanation: 'Build and check status'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: ['npm run build', 'git status'] },
				'commandLine',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should suggest mixed subcommands and base commands', async () => {
			const result = await executeToolTest({
				command: 'git push && echo "done"',
				explanation: 'Push and print done'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: ['git push', 'echo'] },
				'commandLine',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should suggest subcommands for multiple git commands', async () => {
			const result = await executeToolTest({
				command: 'git status && git log --oneline',
				explanation: 'Check status and log'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: ['git status', 'git log'] },
				'commandLine',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should suggest base command for non-subcommand tools', async () => {
			const result = await executeToolTest({
				command: 'foo bar',
				explanation: 'Download from example.com'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'foo' },
				'commandLine',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should handle single word commands from subcommand-aware tools', async () => {
			const result = await executeToolTest({
				command: 'git',
				explanation: 'Run git command'
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
				explanation: 'Run tests twice'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'npm test' },
				'commandLine',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should handle flags differently than subcommands for suggestion logic', async () => {
			const result = await executeToolTest({
				command: 'foo --version',
				explanation: 'Check foo version'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'foo' },
				'commandLine',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should not suggest overly permissive subcommand rules', async () => {
			const result = await executeToolTest({
				command: 'bash -c "echo hello"',
				explanation: 'Run bash command'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				'commandLine',
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
			setConfig(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, 'outsideWorkspace');
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
		test('should dispose associated terminals when chat session is disposed', () => {
			const sessionId = 'test-session-123';
			// eslint-disable-next-line local/code-no-any-casts
			const mockTerminal: ITerminalInstance = {
				dispose: () => { /* Mock dispose */ },
				processId: 12345
			} as any;
			let terminalDisposed = false;
			mockTerminal.dispose = () => { terminalDisposed = true; };

			runInTerminalTool.sessionTerminalAssociations.set(sessionId, {
				instance: mockTerminal,
				shellIntegrationQuality: ShellIntegrationQuality.None
			});

			ok(runInTerminalTool.sessionTerminalAssociations.has(sessionId), 'Terminal association should exist before disposal');

			chatServiceDisposeEmitter.fire({ sessionResource: [LocalChatSessionUri.forSession(sessionId)], reason: 'cleared' });

			strictEqual(terminalDisposed, true, 'Terminal should have been disposed');
			ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionId), 'Terminal association should be removed after disposal');
		});

		test('should not affect other sessions when one session is disposed', () => {
			const sessionId1 = 'test-session-1';
			const sessionId2 = 'test-session-2';
			// eslint-disable-next-line local/code-no-any-casts
			const mockTerminal1: ITerminalInstance = {
				dispose: () => { /* Mock dispose */ },
				processId: 12345
			} as any;
			// eslint-disable-next-line local/code-no-any-casts
			const mockTerminal2: ITerminalInstance = {
				dispose: () => { /* Mock dispose */ },
				processId: 67890
			} as any;

			let terminal1Disposed = false;
			let terminal2Disposed = false;
			mockTerminal1.dispose = () => { terminal1Disposed = true; };
			mockTerminal2.dispose = () => { terminal2Disposed = true; };

			runInTerminalTool.sessionTerminalAssociations.set(sessionId1, {
				instance: mockTerminal1,
				shellIntegrationQuality: ShellIntegrationQuality.None
			});
			runInTerminalTool.sessionTerminalAssociations.set(sessionId2, {
				instance: mockTerminal2,
				shellIntegrationQuality: ShellIntegrationQuality.None
			});

			ok(runInTerminalTool.sessionTerminalAssociations.has(sessionId1), 'Session 1 terminal association should exist');
			ok(runInTerminalTool.sessionTerminalAssociations.has(sessionId2), 'Session 2 terminal association should exist');

			chatServiceDisposeEmitter.fire({ sessionResource: [LocalChatSessionUri.forSession(sessionId1)], reason: 'cleared' });

			strictEqual(terminal1Disposed, true, 'Terminal 1 should have been disposed');
			strictEqual(terminal2Disposed, false, 'Terminal 2 should NOT have been disposed');
			ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionId1), 'Session 1 terminal association should be removed');
			ok(runInTerminalTool.sessionTerminalAssociations.has(sessionId2), 'Session 2 terminal association should remain');
		});

		test('should handle disposal of non-existent session gracefully', () => {
			strictEqual(runInTerminalTool.sessionTerminalAssociations.size, 0, 'No associations should exist initially');
			chatServiceDisposeEmitter.fire({ sessionResource: [LocalChatSessionUri.forSession('non-existent-session')], reason: 'cleared' });
			strictEqual(runInTerminalTool.sessionTerminalAssociations.size, 0, 'No associations should exist after handling non-existent session');
		});
	});

	suite('auto approve warning acceptance mechanism', () => {
		test('should require confirmation for auto-approvable commands when warning not accepted', async () => {
			setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
			setAutoApprove({
				echo: true
			});

			clearAutoApproveWarningAcceptedState();

			assertConfirmationRequired(await executeToolTest({ command: 'echo hello world' }), 'Run `bash` command?');
		});

		test('should auto-approve commands when both auto-approve enabled and warning accepted', async () => {
			setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
			setAutoApprove({
				echo: true
			});

			assertAutoApproved(await executeToolTest({ command: 'echo hello world' }));
		});

		test('should require confirmation when auto-approve disabled regardless of warning acceptance', async () => {
			setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, false);
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

			const autoApproveInfo = (result!.toolSpecificData as IChatTerminalToolInvocationData).autoApproveInfo!;
			ok(autoApproveInfo);
			ok(autoApproveInfo.value.includes('Auto approved by rule '), 'should contain singular "rule", not plural');
			strictEqual(count(autoApproveInfo.value, 'echo'), 1);
		});
	});

	suite('session auto approval', () => {
		test('should auto approve all commands when session has auto approval enabled', async () => {
			const sessionId = 'test-session-123';
			const terminalChatService = instantiationService.get(ITerminalChatService);

			const context: IToolInvocationPreparationContext = {
				parameters: {
					command: 'rm dangerous-file.txt',
					explanation: 'Remove a file',
					isBackground: false
				} as IRunInTerminalInputParams,
				chatSessionId: sessionId
			} as IToolInvocationPreparationContext;

			let result = await runInTerminalTool.prepareToolInvocation(context, CancellationToken.None);
			assertConfirmationRequired(result);

			terminalChatService.setChatSessionAutoApproval(sessionId, true);

			result = await runInTerminalTool.prepareToolInvocation(context, CancellationToken.None);
			assertAutoApproved(result);

			const terminalData = result!.toolSpecificData as IChatTerminalToolInvocationData;
			ok(terminalData.autoApproveInfo, 'Expected autoApproveInfo to be defined');
			ok(terminalData.autoApproveInfo.value.includes('Auto approved for this session'), 'Expected session approval message');
		});
	});

	suite('TerminalProfileFetcher', () => {
		suite('getCopilotProfile', () => {
			(isWindows ? test : test.skip)('should return custom profile when configured', async () => {
				runInTerminalTool.setBackendOs(OperatingSystem.Windows);
				const customProfile = Object.freeze({ path: 'C:\\Windows\\System32\\powershell.exe', args: ['-NoProfile'] });
				setConfig(TerminalChatAgentToolsSettingId.TerminalProfileWindows, customProfile);

				const result = await runInTerminalTool.profileFetcher.getCopilotProfile();
				strictEqual(result, customProfile);
			});

			(isLinux ? test : test.skip)('should fall back to default shell when no custom profile is configured', async () => {
				runInTerminalTool.setBackendOs(OperatingSystem.Linux);
				setConfig(TerminalChatAgentToolsSettingId.TerminalProfileLinux, null);

				const result = await runInTerminalTool.profileFetcher.getCopilotProfile();
				strictEqual(typeof result, 'object');
				strictEqual((result as ITerminalProfile).path, 'bash');
			});
		});
	});
});
