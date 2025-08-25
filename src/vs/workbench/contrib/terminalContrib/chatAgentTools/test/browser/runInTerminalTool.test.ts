/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { Separator } from '../../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IChatService } from '../../../../chat/common/chatService.js';
import { ILanguageModelToolsService, IPreparedToolInvocation, IToolInvocationPreparationContext, type ToolConfirmationAction } from '../../../../chat/common/languageModelToolsService.js';
import { ITerminalService, type ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { ITerminalProfileResolverService } from '../../../../terminal/common/terminal.js';
import { RunInTerminalTool, type IRunInTerminalInputParams } from '../../browser/tools/runInTerminalTool.js';
import { ShellIntegrationQuality } from '../../browser/toolTerminalCreator.js';
import { terminalChatAgentToolsConfiguration, TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { TerminalToolConfirmationStorageKeys } from '../../../../chat/browser/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js';

class TestRunInTerminalTool extends RunInTerminalTool {
	protected override _osBackend: Promise<OperatingSystem> = Promise.resolve(OperatingSystem.Windows);

	get commandLineAutoApprover() { return this._commandLineAutoApprover; }
	get sessionTerminalAssociations() { return this._sessionTerminalAssociations; }

	setBackendOs(os: OperatingSystem) {
		this._osBackend = Promise.resolve(os);
	}
}

suite('RunInTerminalTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let storageService: IStorageService;
	let terminalServiceDisposeEmitter: Emitter<ITerminalInstance>;
	let chatServiceDisposeEmitter: Emitter<{ sessionId: string; reason: 'cleared' }>;

	let runInTerminalTool: TestRunInTerminalTool;

	setup(() => {
		configurationService = new TestConfigurationService();
		setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
		terminalServiceDisposeEmitter = new Emitter<ITerminalInstance>();
		chatServiceDisposeEmitter = new Emitter<{ sessionId: string; reason: 'cleared' }>();

		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
		}, store);
		instantiationService.stub(ILanguageModelToolsService, {
			getTools() {
				return [];
			},
		});
		instantiationService.stub(ITerminalService, {
			onDidDisposeInstance: terminalServiceDisposeEmitter.event
		});
		instantiationService.stub(IChatService, {
			onDidDisposeSession: chatServiceDisposeEmitter.event
		});
		instantiationService.stub(ITerminalProfileResolverService, {
			getDefaultShell: async () => 'pwsh'
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

			// Safe git sub-commands
			'git status',
			'git log --oneline',
			'git show HEAD',
			'git diff main',

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
			'grep -f patterns.txt file.txt',
			'grep -P "complex.*regex" file.txt',
			'sort -o /etc/passwd file.txt',
			'sort -S 100G file.txt',
			'tree -o output.txt',

			// Dangerous patterns
			'echo $(whoami)',
			'ls $(pwd)',
			'echo `date`',
			'cat `which ls`',
			'echo ${HOME}',
			'ls {a,b,c}',
			'echo (Get-Date)'
		];

		suite('auto approved', () => {
			for (const command of autoApprovedTestCases) {
				test(command, async () => {
					assertAutoApproved(await executeToolTest({ command: command }));
				});
			}
		});
		suite('confirmation required', () => {
			for (const command of confirmationRequiredTestCases) {
				test(command, async () => {
					assertConfirmationRequired(await executeToolTest({ command: command }));
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
			assertConfirmationRequired(result, 'Run `pwsh` command?');
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
			assertConfirmationRequired(result, 'Run `pwsh` command?');
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
			assertConfirmationRequired(result, 'Run `pwsh` command? (background terminal)');
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

		test('should handle commands with only whitespace', async () => {
			setAutoApprove({
				echo: true
			});

			const result = await executeToolTest({
				command: '   \t\n   ',
				explanation: 'Whitespace only command'
			});
			assertConfirmationRequired(result);
		});

		test('should handle matchCommandLine: true patterns', async () => {
			setAutoApprove({
				"/dangerous/": { approve: false, matchCommandLine: true },
				"echo": { approve: true, matchCommandLine: true }
			});

			const result1 = await executeToolTest({ command: 'echo hello world' });
			assertAutoApproved(result1);

			const result2 = await executeToolTest({ command: 'echo this is a dangerous command' });
			assertConfirmationRequired(result2);
		});

		test('should only approve when neither sub-commands or command lines are denied', async () => {
			setAutoApprove({
				"foo": true,
				"/^foo$/": { approve: false, matchCommandLine: true },
			});

			const result1 = await executeToolTest({ command: 'foo' });
			assertConfirmationRequired(result1);

			const result2 = await executeToolTest({ command: 'foo bar' });
			assertAutoApproved(result2);
		});
	});

	suite('prepareToolInvocation - custom actions for dropdown', () => {

		test('should generate custom actions for non-auto-approved commands', async () => {
			setAutoApprove({
				ls: true,
			});

			const result = await executeToolTest({
				command: 'npm run build',
				explanation: 'Build the project'
			});

			assertConfirmationRequired(result, 'Run `pwsh` command?');
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);


			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Command: npm run build');
			strictEqual(customActions[0].data.type, 'newRule');
			ok(Array.isArray(customActions[0].data.rule), 'Expected rule to be an array');

			ok(!isSeparator(customActions[1]));
			strictEqual(customActions[1].label, 'Always Allow Exact Command Line');
			strictEqual(customActions[1].data.type, 'newRule');
			ok(!Array.isArray(customActions[1].data.rule), 'Expected rule to be an object');

			ok(isSeparator(customActions[2]));

			ok(!isSeparator(customActions[3]));
			strictEqual(customActions[3].label, 'Configure Auto Approve...');
			strictEqual(customActions[3].data.type, 'configure');
		});

		test('should generate custom actions for single word commands', async () => {
			const result = await executeToolTest({
				command: 'git',
				explanation: 'Run git command'
			});

			assertConfirmationRequired(result);
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;

			strictEqual(customActions.length, 3);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Command: git');
			strictEqual(customActions[0].data.type, 'newRule');
			ok(Array.isArray(customActions[0].data.rule), 'Expected rule to be an array');

			ok(isSeparator(customActions[1]));

			ok(!isSeparator(customActions[2]));
			strictEqual(customActions[2].label, 'Configure Auto Approve...');
			strictEqual(customActions[2].data.type, 'configure');
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

			assertConfirmationRequired(result, 'Run `pwsh` command?');
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 1, 'Expected only 1 custom action for explicitly denied commands');

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Configure Auto Approve...');
			strictEqual(customActions[0].data.type, 'configure');
		});

		test('should handle && in command line labels with proper mnemonic escaping', async () => {
			const result = await executeToolTest({
				command: 'npm install && npm run build',
				explanation: 'Install dependencies and build'
			});

			assertConfirmationRequired(result, 'Run `pwsh` command?');
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Commands: npm install, npm run build');
			strictEqual(customActions[0].data.type, 'newRule');

			ok(!isSeparator(customActions[1]));
			strictEqual(customActions[1].label, 'Always Allow Exact Command Line');
			strictEqual(customActions[1].data.type, 'newRule');

			ok(isSeparator(customActions[2]));

			ok(!isSeparator(customActions[3]));
			strictEqual(customActions[3].label, 'Configure Auto Approve...');
			strictEqual(customActions[3].data.type, 'configure');
		});

		test('should not show approved commands in custom actions dropdown', async () => {
			setAutoApprove({
				head: true  // head is approved by default in real scenario
			});

			const result = await executeToolTest({
				command: 'foo | head -20',
				explanation: 'Run foo command and show first 20 lines'
			});

			assertConfirmationRequired(result, 'Run `pwsh` command?');
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Command: foo', 'Should only show \'foo\' since \'head\' is auto-approved');
			strictEqual(customActions[0].data.type, 'newRule');

			ok(!isSeparator(customActions[1]));
			strictEqual(customActions[1].label, 'Always Allow Exact Command Line');
			strictEqual(customActions[1].data.type, 'newRule');

			ok(isSeparator(customActions[2]));

			ok(!isSeparator(customActions[3]));
			strictEqual(customActions[3].label, 'Configure Auto Approve...');
			strictEqual(customActions[3].data.type, 'configure');
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

			assertConfirmationRequired(result, 'Run `pwsh` command?');
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Commands: foo, bar', 'Should only show \'foo, bar\' since \'head\' and \'tail\' are auto-approved');
			strictEqual(customActions[0].data.type, 'newRule');

			ok(!isSeparator(customActions[1]));
			strictEqual(customActions[1].label, 'Always Allow Exact Command Line');
			strictEqual(customActions[1].data.type, 'newRule');

			ok(isSeparator(customActions[2]));

			ok(!isSeparator(customActions[3]));
			strictEqual(customActions[3].label, 'Configure Auto Approve...');
			strictEqual(customActions[3].data.type, 'configure');
		});

		test('should suggest subcommand for git commands', async () => {
			const result = await executeToolTest({
				command: 'git status',
				explanation: 'Check git status'
			});

			assertConfirmationRequired(result);
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Command: git status');
			strictEqual(customActions[0].data.type, 'newRule');
			ok(Array.isArray(customActions[0].data.rule), 'Expected rule to be an array');
			strictEqual((customActions[0].data.rule as any)[0].key, 'git status');
		});

		test('should suggest subcommand for npm commands', async () => {
			const result = await executeToolTest({
				command: 'npm test',
				explanation: 'Run npm tests'
			});

			assertConfirmationRequired(result);
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Command: npm test');
			strictEqual(customActions[0].data.type, 'newRule');
			ok(Array.isArray(customActions[0].data.rule), 'Expected rule to be an array');
			strictEqual((customActions[0].data.rule as any)[0].key, 'npm test');
		});

		test('should suggest 3-part subcommand for npm run commands', async () => {
			const result = await executeToolTest({
				command: 'npm run build',
				explanation: 'Run build script'
			});

			assertConfirmationRequired(result);
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Command: npm run build');
			strictEqual(customActions[0].data.type, 'newRule');
			ok(Array.isArray(customActions[0].data.rule), 'Expected rule to be an array');
			strictEqual((customActions[0].data.rule as any)[0].key, 'npm run build');
		});

		test('should suggest 3-part subcommand for yarn run commands', async () => {
			const result = await executeToolTest({
				command: 'yarn run test',
				explanation: 'Run test script'
			});

			assertConfirmationRequired(result);
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Command: yarn run test');
			strictEqual(customActions[0].data.type, 'newRule');
			ok(Array.isArray(customActions[0].data.rule), 'Expected rule to be an array');
			strictEqual((customActions[0].data.rule as any)[0].key, 'yarn run test');
		});

		test('should not suggest subcommand for commands with flags', async () => {
			const result = await executeToolTest({
				command: 'npm --foo --bar',
				explanation: 'Run npm with flags'
			});

			assertConfirmationRequired(result);
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Command: npm');
			strictEqual(customActions[0].data.type, 'newRule');
			ok(Array.isArray(customActions[0].data.rule), 'Expected rule to be an array');
			strictEqual((customActions[0].data.rule as any)[0].key, 'npm');
		});

		test('should not suggest subcommand for git commands with flags', async () => {
			const result = await executeToolTest({
				command: 'git --version',
				explanation: 'Check git version'
			});

			assertConfirmationRequired(result);
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Command: git');
			strictEqual(customActions[0].data.type, 'newRule');
			ok(Array.isArray(customActions[0].data.rule), 'Expected rule to be an array');
			strictEqual((customActions[0].data.rule as any)[0].key, 'git');
		});

		test('should not suggest subcommand for npm run with flags', async () => {
			const result = await executeToolTest({
				command: 'npm run --some-flag',
				explanation: 'Run npm run with flags'
			});

			assertConfirmationRequired(result);
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Command: npm run');
			strictEqual(customActions[0].data.type, 'newRule');
			ok(Array.isArray(customActions[0].data.rule), 'Expected rule to be an array');
			strictEqual((customActions[0].data.rule as any)[0].key, 'npm run');
		});

		test('should handle mixed npm run and other commands', async () => {
			const result = await executeToolTest({
				command: 'npm run build && git status',
				explanation: 'Build and check status'
			});

			assertConfirmationRequired(result);
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Commands: npm run build, git status');
			strictEqual(customActions[0].data.type, 'newRule');
			ok(Array.isArray(customActions[0].data.rule), 'Expected rule to be an array');
			const rules = customActions[0].data.rule as any;
			strictEqual(rules.length, 2);
			strictEqual(rules[0].key, 'npm run build');
			strictEqual(rules[1].key, 'git status');
		});

		test('should suggest mixed subcommands and base commands', async () => {
			const result = await executeToolTest({
				command: 'git push && echo "done"',
				explanation: 'Push and print done'
			});

			assertConfirmationRequired(result);
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Commands: git push, echo');
			strictEqual(customActions[0].data.type, 'newRule');
			ok(Array.isArray(customActions[0].data.rule), 'Expected rule to be an array');
			const rules = customActions[0].data.rule as any;
			strictEqual(rules.length, 2);
			strictEqual(rules[0].key, 'git push');
			strictEqual(rules[1].key, 'echo');
		});

		test('should suggest subcommands for multiple git commands', async () => {
			const result = await executeToolTest({
				command: 'git status && git log --oneline',
				explanation: 'Check status and log'
			});

			assertConfirmationRequired(result);
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Commands: git status, git log');
			strictEqual(customActions[0].data.type, 'newRule');
			ok(Array.isArray(customActions[0].data.rule), 'Expected rule to be an array');
			const rules = customActions[0].data.rule as any;
			strictEqual(rules.length, 2);
			strictEqual(rules[0].key, 'git status');
			strictEqual(rules[1].key, 'git log');
		});

		test('should suggest base command for non-subcommand tools', async () => {
			const result = await executeToolTest({
				command: 'curl https://example.com',
				explanation: 'Download from example.com'
			});

			assertConfirmationRequired(result);
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Command: curl');
			strictEqual(customActions[0].data.type, 'newRule');
			ok(Array.isArray(customActions[0].data.rule), 'Expected rule to be an array');
			strictEqual((customActions[0].data.rule as any)[0].key, 'curl');
		});

		test('should handle single word commands from subcommand-aware tools', async () => {
			const result = await executeToolTest({
				command: 'git',
				explanation: 'Run git command'
			});

			assertConfirmationRequired(result);
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 3); // No full command line suggestion for single word

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Command: git');
			strictEqual(customActions[0].data.type, 'newRule');
			ok(Array.isArray(customActions[0].data.rule), 'Expected rule to be an array');
			strictEqual((customActions[0].data.rule as any)[0].key, 'git');
		});

		test('should deduplicate identical subcommand suggestions', async () => {
			const result = await executeToolTest({
				command: 'npm test && npm test --verbose',
				explanation: 'Run tests twice'
			});

			assertConfirmationRequired(result);
			ok(result!.confirmationMessages!.terminalCustomActions, 'Expected custom actions to be defined');

			const customActions = result!.confirmationMessages!.terminalCustomActions!;
			strictEqual(customActions.length, 4);

			ok(!isSeparator(customActions[0]));
			strictEqual(customActions[0].label, 'Always Allow Command: npm test');
			strictEqual(customActions[0].data.type, 'newRule');
			ok(Array.isArray(customActions[0].data.rule), 'Expected rule to be an array');
			const rules = customActions[0].data.rule as any;
			strictEqual(rules.length, 1); // Should be deduplicated
			strictEqual(rules[0].key, 'npm test');
		});

	});

	suite('chat session disposal cleanup', () => {
		test('should dispose associated terminals when chat session is disposed', () => {
			const sessionId = 'test-session-123';
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

			chatServiceDisposeEmitter.fire({ sessionId, reason: 'cleared' });

			strictEqual(terminalDisposed, true, 'Terminal should have been disposed');
			ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionId), 'Terminal association should be removed after disposal');
		});

		test('should not affect other sessions when one session is disposed', () => {
			const sessionId1 = 'test-session-1';
			const sessionId2 = 'test-session-2';
			const mockTerminal1: ITerminalInstance = {
				dispose: () => { /* Mock dispose */ },
				processId: 12345
			} as any;
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

			chatServiceDisposeEmitter.fire({ sessionId: sessionId1, reason: 'cleared' });

			strictEqual(terminal1Disposed, true, 'Terminal 1 should have been disposed');
			strictEqual(terminal2Disposed, false, 'Terminal 2 should NOT have been disposed');
			ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionId1), 'Session 1 terminal association should be removed');
			ok(runInTerminalTool.sessionTerminalAssociations.has(sessionId2), 'Session 2 terminal association should remain');
		});

		test('should handle disposal of non-existent session gracefully', () => {
			strictEqual(runInTerminalTool.sessionTerminalAssociations.size, 0, 'No associations should exist initially');
			chatServiceDisposeEmitter.fire({ sessionId: 'non-existent-session', reason: 'cleared' });
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

			assertConfirmationRequired(await executeToolTest({ command: 'echo hello world' }), 'Run `pwsh` command?');
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
			assertConfirmationRequired(result, 'Run `pwsh` command?');
		});
	});
});
