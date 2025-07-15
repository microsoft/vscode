/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IToolInvocationPreparationContext, IPreparedToolInvocation, ILanguageModelToolsService } from '../../../../chat/common/languageModelToolsService.js';
import { CommandLineAutoApprover } from '../../browser/commandLineAutoApprover.js';
import { RunInTerminalTool, type IRunInTerminalInputParams } from '../../browser/runInTerminalTool.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';

class TestRunInTerminalTool extends RunInTerminalTool {
	get commandLineAutoApprover(): CommandLineAutoApprover { return this._commandLineAutoApprover; }

	async rewriteCommandIfNeeded(options: IToolInvocationPreparationContext, args: IRunInTerminalInputParams, shell: string): Promise<string> {
		return this._rewriteCommandIfNeeded(options, args, shell);
	}
}

suite('RunInTerminalTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let workspaceService: TestContextService;

	let runInTerminalTool: TestRunInTerminalTool;

	setup(() => {
		configurationService = new TestConfigurationService();
		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
		}, store);
		instantiationService.stub(ILanguageModelToolsService, {
			getTools() {
				return [];
			},
		});
		workspaceService = instantiationService.invokeFunction(accessor => accessor.get(IWorkspaceContextService)) as TestContextService;

		runInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
	});

	/**
	 * Sets up the configuration with allow and deny lists
	 */
	function setupConfiguration(allowList: string[] = [], denyList: string[] = []) {
		const allowListObject: { [key: string]: boolean } = {};
		for (const entry of allowList) {
			allowListObject[entry] = true;
		}
		const denyListObject: { [key: string]: boolean } = {};
		for (const entry of denyList) {
			denyListObject[entry] = true;
		}
		setConfig(TerminalChatAgentToolsSettingId.AllowList, allowListObject);
		setConfig(TerminalChatAgentToolsSettingId.DenyList, denyListObject);
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

	suite('prepareToolInvocation - auto approval behavior', () => {

		test('should auto-approve commands in allow list', async () => {
			setupConfiguration(['echo']);

			const result = await executeToolTest({ command: 'echo hello world' });
			assertAutoApproved(result);
		});

		test('should require confirmation for commands not in allow list', async () => {
			setupConfiguration(['ls']);

			const result = await executeToolTest({
				command: 'rm file.txt',
				explanation: 'Remove a file'
			});
			assertConfirmationRequired(result, 'Run command in terminal');
		});

		test('should require confirmation for commands in deny list even if in allow list', async () => {
			setupConfiguration(['rm', 'echo'], ['rm']);

			const result = await executeToolTest({
				command: 'rm dangerous-file.txt',
				explanation: 'Remove a dangerous file'
			});
			assertConfirmationRequired(result, 'Run command in terminal');
		});

		test('should handle background commands with confirmation', async () => {
			setupConfiguration(['ls']);

			const result = await executeToolTest({
				command: 'npm run watch',
				explanation: 'Start watching for file changes',
				isBackground: true
			});
			assertConfirmationRequired(result, 'Run command in background terminal');
		});

		test('should auto-approve background commands in allow list', async () => {
			setupConfiguration(['npm']);

			const result = await executeToolTest({
				command: 'npm run watch',
				explanation: 'Start watching for file changes',
				isBackground: true
			});
			assertAutoApproved(result);
		});

		test('should handle regex patterns in allow list', async () => {
			setupConfiguration(['/^git (status|log)/']);

			const result = await executeToolTest({ command: 'git status --porcelain' });
			assertAutoApproved(result);
		});

		test('should handle complex command chains with sub-commands', async () => {
			setupConfiguration(['echo', 'ls']);

			const result = await executeToolTest({ command: 'echo "hello" && ls -la' });
			assertAutoApproved(result);
		});

		test('should require confirmation when one sub-command is not approved', async () => {
			setupConfiguration(['echo']);

			const result = await executeToolTest({ command: 'echo "hello" && rm file.txt' });
			assertConfirmationRequired(result);
		});

		test('should handle empty command strings', async () => {
			setupConfiguration(['echo']);

			const result = await executeToolTest({
				command: '',
				explanation: 'Empty command'
			});
			assertConfirmationRequired(result);
		});

		test('should handle commands with only whitespace', async () => {
			setupConfiguration(['echo']);

			const result = await executeToolTest({
				command: '   \t\n   ',
				explanation: 'Whitespace only command'
			});
			assertConfirmationRequired(result);
		});
	});

	suite('command re-writing', () => {
		function createRewriteOptions(command: string, chatSessionId?: string): IToolInvocationPreparationContext {
			return {
				parameters: {
					command,
					explanation: 'Test command',
					isBackground: false
				} as IRunInTerminalInputParams,
				chatSessionId
			} as IToolInvocationPreparationContext;
		}

		suite('cd <cwd> && <suffix> -> <suffix>', () => {
			test('should return original command when no cd prefix pattern matches', async () => {
				const options = createRewriteOptions('echo hello world');
				const result = await runInTerminalTool.rewriteCommandIfNeeded(options, options.parameters as IRunInTerminalInputParams, 'pwsh');

				strictEqual(result, 'echo hello world');
			});

			test('should return original command when cd pattern does not have suffix', async () => {
				const options = createRewriteOptions('cd /some/path');
				const result = await runInTerminalTool.rewriteCommandIfNeeded(options, options.parameters as IRunInTerminalInputParams, 'pwsh');

				strictEqual(result, 'cd /some/path');
			});

			test('should rewrite command with ; separator when directory matches cwd', async () => {
				const testDir = '/test/workspace';
				const options = createRewriteOptions(`cd ${testDir}; npm test`, 'session-1');
				workspaceService.setWorkspace({
					folders: [{ uri: { fsPath: testDir } }]
				} as any);

				const result = await runInTerminalTool.rewriteCommandIfNeeded(options, options.parameters as IRunInTerminalInputParams, 'pwsh');

				strictEqual(result, 'npm test');
			});

			test('should rewrite command with && separator when directory matches cwd', async () => {
				const testDir = '/test/workspace';
				const options = createRewriteOptions(`cd ${testDir} && npm install`, 'session-1');
				workspaceService.setWorkspace({
					folders: [{ uri: { fsPath: testDir } }]
				} as any);

				const result = await runInTerminalTool.rewriteCommandIfNeeded(options, options.parameters as IRunInTerminalInputParams, 'bash');

				strictEqual(result, 'npm install');
			});

			test('should rewrite command when the path is wrapped in double quotes', async () => {
				const testDir = '/test/workspace';
				const options = createRewriteOptions(`cd "${testDir}" && npm install`, 'session-1');
				workspaceService.setWorkspace({
					folders: [{ uri: { fsPath: testDir } }]
				} as any);

				const result = await runInTerminalTool.rewriteCommandIfNeeded(options, options.parameters as IRunInTerminalInputParams, 'bash');

				strictEqual(result, 'npm install');
			});

			test('should not rewrite command when directory does not match cwd', async () => {
				const testDir = '/test/workspace';
				const differentDir = '/different/path';
				const command = `cd ${differentDir} && npm install`;
				const options = createRewriteOptions(command, 'session-1');
				workspaceService.setWorkspace({
					folders: [{ uri: { fsPath: testDir } }]
				} as any);

				const result = await runInTerminalTool.rewriteCommandIfNeeded(options, options.parameters as IRunInTerminalInputParams, 'bash');

				strictEqual(result, command);
			});

			test('should return original command when no workspace folders available', async () => {
				const command = 'cd /some/path && npm install';
				const options = createRewriteOptions(command, 'session-1');
				workspaceService.setWorkspace({
					folders: []
				} as any);

				const result = await runInTerminalTool.rewriteCommandIfNeeded(options, options.parameters as IRunInTerminalInputParams, 'bash');

				strictEqual(result, command);
			});

			test('should return original command when multiple workspace folders available', async () => {
				const command = 'cd /some/path && npm install';
				const options = createRewriteOptions(command, 'session-1');
				workspaceService.setWorkspace({
					folders: [
						{ uri: { fsPath: '/workspace1' } },
						{ uri: { fsPath: '/workspace2' } }
					]
				} as any);

				const result = await runInTerminalTool.rewriteCommandIfNeeded(options, options.parameters as IRunInTerminalInputParams, 'bash');

				strictEqual(result, command);
			});

			test('should handle commands with complex suffixes', async () => {
				const testDir = '/test/workspace';
				const command = `cd ${testDir} && npm install && npm test && echo "done"`;
				const options = createRewriteOptions(command, 'session-1');
				workspaceService.setWorkspace({
					folders: [{ uri: { fsPath: testDir } }]
				} as any);

				const result = await runInTerminalTool.rewriteCommandIfNeeded(options, options.parameters as IRunInTerminalInputParams, 'bash');

				strictEqual(result, 'npm install && npm test && echo "done"');
			});

			test('should handle session without chatSessionId', async () => {
				const command = 'cd /some/path && npm install';
				const options = createRewriteOptions(command);
				workspaceService.setWorkspace({
					folders: [{ uri: { fsPath: '/some/path' } }]
				} as any);

				const result = await runInTerminalTool.rewriteCommandIfNeeded(options, options.parameters as IRunInTerminalInputParams, 'bash');

				strictEqual(result, 'npm install');
			});

			test('should ignore any trailing back slash', async () => {
				const testDir = 'c:\\test\\workspace';
				const options = createRewriteOptions(`cd ${testDir}\\ && npm install`, 'session-1');
				workspaceService.setWorkspace({
					folders: [{ uri: { fsPath: testDir } }]
				} as any);

				const result = await runInTerminalTool.rewriteCommandIfNeeded(options, options.parameters as IRunInTerminalInputParams, 'cmd');

				strictEqual(result, 'npm install');
			});

			test('should ignore any trailing forward slash', async () => {
				const testDir = '/test/workspace';
				const options = createRewriteOptions(`cd ${testDir}/ && npm install`, 'session-1');
				workspaceService.setWorkspace({
					folders: [{ uri: { fsPath: testDir } }]
				} as any);

				const result = await runInTerminalTool.rewriteCommandIfNeeded(options, options.parameters as IRunInTerminalInputParams, 'bash');

				strictEqual(result, 'npm install');
			});
		});
	});
});
