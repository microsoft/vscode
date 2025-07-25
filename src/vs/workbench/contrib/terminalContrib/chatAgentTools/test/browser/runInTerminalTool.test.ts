/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
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
import { ITerminalService, type ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { Emitter } from '../../../../../../base/common/event.js';

class TestRunInTerminalTool extends RunInTerminalTool {
	protected override _osBackend: Promise<OperatingSystem> = Promise.resolve(OperatingSystem.Windows);

	get commandLineAutoApprover(): CommandLineAutoApprover { return this._commandLineAutoApprover; }

	async rewriteCommandIfNeeded(args: IRunInTerminalInputParams, instance: Pick<ITerminalInstance, 'getCwdResource'> | undefined, shell: string): Promise<string> {
		return this._rewriteCommandIfNeeded(args, instance, shell);
	}

	setBackendOs(os: OperatingSystem) {
		this._osBackend = Promise.resolve(os);
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
		instantiationService.stub(ITerminalService, {
			onDidDisposeInstance: new Emitter<ITerminalInstance>().event
		});
		workspaceService = instantiationService.invokeFunction(accessor => accessor.get(IWorkspaceContextService)) as TestContextService;

		runInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
	});

	function setAutoApprove(value: { [key: string]: boolean }) {
		setConfig(TerminalChatAgentToolsSettingId.AutoApprove, value);
	}

	function setAutoApproveWithCommandLine(value: { [key: string]: { approve: boolean; matchCommandLine?: boolean } | boolean }) {
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

	function createInstanceWithCwd(uri: URI | undefined): Pick<ITerminalInstance, 'getCwdResource'> | undefined {
		return {
			getCwdResource: async () => uri
		};
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
			assertConfirmationRequired(result, 'Run command in terminal');
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
			assertConfirmationRequired(result, 'Run command in terminal');
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
			assertConfirmationRequired(result, 'Run command in background terminal');
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
			assertConfirmationRequired(result);
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
			setAutoApproveWithCommandLine({
				"/dangerous/": { approve: false, matchCommandLine: true },
				"echo": { approve: true, matchCommandLine: true }
			});

			// Command line pattern should be approved
			const result1 = await executeToolTest({ command: 'echo hello world' });
			assertAutoApproved(result1);

			// Command line pattern should be denied due to dangerous content
			const result2 = await executeToolTest({ command: 'echo this is a dangerous command' });
			assertConfirmationRequired(result2);
		});
	});

	suite('command re-writing', () => {
		function createRewriteParams(command: string, chatSessionId?: string): IRunInTerminalInputParams {
			return {
				command,
				explanation: 'Test command',
				isBackground: false
			};
		}

		suite('cd <cwd> && <suffix> -> <suffix>', () => {
			suite('Posix', () => {
				setup(() => {
					runInTerminalTool.setBackendOs(OperatingSystem.Linux);
				});

				test('should return original command when no cd prefix pattern matches', async () => {
					const parameters = createRewriteParams('echo hello world');
					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, undefined, 'pwsh');

					strictEqual(result, 'echo hello world');
				});

				test('should return original command when cd pattern does not have suffix', async () => {
					runInTerminalTool.setBackendOs(OperatingSystem.Linux);
					const parameters = createRewriteParams('cd /some/path');
					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, undefined, 'pwsh');

					strictEqual(result, 'cd /some/path');
				});

				test('should rewrite command with ; separator when directory matches cwd', async () => {
					const testDir = '/test/workspace';
					const parameters = createRewriteParams(`cd ${testDir}; npm test`, 'session-1');
					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: testDir } }]
					} as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, undefined, 'pwsh');

					strictEqual(result, 'npm test');
				});

				test('should rewrite command with && separator when directory matches cwd', async () => {
					const testDir = '/test/workspace';
					const parameters = createRewriteParams(`cd ${testDir} && npm install`, 'session-1');
					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: testDir } }]
					} as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, undefined, 'bash');

					strictEqual(result, 'npm install');
				});

				test('should rewrite command when the path is wrapped in double quotes', async () => {
					const testDir = '/test/workspace';
					const parameters = createRewriteParams(`cd "${testDir}" && npm install`, 'session-1');
					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: testDir } }]
					} as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, undefined, 'bash');

					strictEqual(result, 'npm install');
				});

				test('should not rewrite command when directory does not match cwd', async () => {
					const testDir = '/test/workspace';
					const differentDir = '/different/path';
					const command = `cd ${differentDir} && npm install`;
					const parameters = createRewriteParams(command, 'session-1');
					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: testDir } }]
					} as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, undefined, 'bash');

					strictEqual(result, command);
				});

				test('should return original command when no workspace folders available', async () => {
					const command = 'cd /some/path && npm install';
					const parameters = createRewriteParams(command, 'session-1');
					workspaceService.setWorkspace({
						folders: []
					} as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, undefined, 'bash');

					strictEqual(result, command);
				});

				test('should return original command when multiple workspace folders available', async () => {
					const command = 'cd /some/path && npm install';
					const parameters = createRewriteParams(command, 'session-1');
					workspaceService.setWorkspace({
						folders: [
							{ uri: { fsPath: '/workspace1' } },
							{ uri: { fsPath: '/workspace2' } }
						]
					} as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, undefined, 'bash');

					strictEqual(result, command);
				});

				test('should handle commands with complex suffixes', async () => {
					const testDir = '/test/workspace';
					const command = `cd ${testDir} && npm install && npm test && echo "done"`;
					const parameters = createRewriteParams(command, 'session-1');
					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: testDir } }]
					} as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, undefined, 'bash');

					strictEqual(result, 'npm install && npm test && echo "done"');
				});

				test('should handle session without chatSessionId', async () => {
					const command = 'cd /some/path && npm install';
					const parameters = createRewriteParams(command);
					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: '/some/path' } }]
					} as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, undefined, 'bash');

					strictEqual(result, 'npm install');
				});

				test('should ignore any trailing forward slash', async () => {
					const testDir = '/test/workspace';
					const parameters = createRewriteParams(`cd ${testDir}/ && npm install`, 'session-1');
					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: testDir } }]
					} as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, undefined, 'bash');

					strictEqual(result, 'npm install');
				});
			});

			suite('Windows', () => {
				setup(() => {
					runInTerminalTool.setBackendOs(OperatingSystem.Windows);
				});

				test('should ignore any trailing back slash', async () => {
					const testDir = 'c:\\test\\workspace';
					const parameters = createRewriteParams(`cd ${testDir}\\ && npm install`, 'session-1');
					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: testDir } }]
					} as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, undefined, 'cmd');

					strictEqual(result, 'npm install');
				});

				test('should prioritize instance cwd over workspace service', async () => {
					const instanceDir = 'C:\\instance\\workspace';
					const workspaceDir = 'C:\\workspace\\service';
					const command = `cd ${instanceDir} && npm test`;
					const parameters = createRewriteParams(command, 'session-1');

					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: workspaceDir } }]
					} as any);
					const instance = createInstanceWithCwd({ fsPath: instanceDir } as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, instance, 'cmd');

					strictEqual(result, 'npm test');
				});

				test('should prioritize instance cwd over workspace service - PowerShell style', async () => {
					const instanceDir = 'C:\\instance\\workspace';
					const workspaceDir = 'C:\\workspace\\service';
					const command = `cd ${instanceDir}; npm test`;
					const parameters = createRewriteParams(command, 'session-1');

					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: workspaceDir } }]
					} as any);
					const instance = createInstanceWithCwd({ fsPath: instanceDir } as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, instance, 'pwsh');

					strictEqual(result, 'npm test');
				});

				test('should not rewrite when instance cwd differs from cd path', async () => {
					const instanceDir = 'C:\\instance\\workspace';
					const cdDir = 'C:\\different\\path';
					const workspaceDir = 'C:\\workspace\\service';
					const command = `cd ${cdDir} && npm test`;
					const parameters = createRewriteParams(command, 'session-1');

					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: workspaceDir } }]
					} as any);
					const instance = createInstanceWithCwd({ fsPath: instanceDir } as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, instance, 'cmd');

					// Should not rewrite since instance cwd doesn't match cd path
					strictEqual(result, command);
				});

				test('should fallback to workspace service when instance getCwdResource returns undefined', async () => {
					const workspaceDir = 'C:\\workspace\\service';
					const command = `cd ${workspaceDir} && npm test`;
					const parameters = createRewriteParams(command, 'session-1');

					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: workspaceDir } }]
					} as any);
					const instance = createInstanceWithCwd(undefined);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, instance, 'cmd');

					strictEqual(result, 'npm test');
				});

				test('should prioritize instance cwd over workspace service even when both match cd path', async () => {
					const sharedDir = 'C:\\shared\\workspace';
					const command = `cd ${sharedDir} && npm build`;
					const parameters = createRewriteParams(command, 'session-1');

					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: sharedDir } }]
					} as any);
					const instance = createInstanceWithCwd({ fsPath: sharedDir } as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, instance, 'cmd');

					strictEqual(result, 'npm build');
				});

				test('should handle case-insensitive comparison on Windows with instance', async () => {
					const instanceDir = 'C:\\Instance\\Workspace';
					const cdDir = 'c:\\instance\\workspace'; // Different case
					const command = `cd ${cdDir} && npm test`;
					const parameters = createRewriteParams(command, 'session-1');

					const instance = createInstanceWithCwd({ fsPath: instanceDir } as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, instance, 'cmd');

					strictEqual(result, 'npm test');
				});

				test('should handle quoted paths with instance priority', async () => {
					const instanceDir = 'C:\\instance\\workspace';
					const command = 'cd "C:\\instance\\workspace" && npm test';
					const parameters = createRewriteParams(command, 'session-1');

					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: 'C:\\different\\workspace' } }]
					} as any);
					const instance = createInstanceWithCwd({ fsPath: instanceDir } as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, instance, 'cmd');

					strictEqual(result, 'npm test');
				});

				test('should handle cd /d flag when directory matches cwd', async () => {
					const testDir = 'C:\\test\\workspace';
					const options = createRewriteParams(`cd /d ${testDir} && echo hello`, 'session-1');
					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: testDir } }]
					} as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(options, undefined, 'pwsh');

					strictEqual(result, 'echo hello');
				});

				test('should handle cd /d flag with quoted paths when directory matches cwd', async () => {
					const testDir = 'C:\\test\\workspace';
					const options = createRewriteParams(`cd /d "${testDir}" && echo hello`, 'session-1');
					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: testDir } }]
					} as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(options, undefined, 'pwsh');

					strictEqual(result, 'echo hello');
				});

				test('should handle cd /d flag with quoted paths from issue example', async () => {
					const testDir = 'd:\\microsoft\\vscode';
					const options = createRewriteParams(`cd /d "${testDir}" && .\\scripts\\test.bat`, 'session-1');
					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: testDir } }]
					} as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(options, undefined, 'pwsh');

					strictEqual(result, '.\\scripts\\test.bat');
				});

				test('should not rewrite cd /d when directory does not match cwd', async () => {
					const testDir = 'C:\\test\\workspace';
					const differentDir = 'C:\\different\\path';
					const command = `cd /d ${differentDir} && echo hello`;
					const options = createRewriteParams(command, 'session-1');
					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: testDir } }]
					} as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(options, undefined, 'pwsh');

					strictEqual(result, command);
				});

				test('should handle cd /d flag with instance priority', async () => {
					const instanceDir = 'C:\\instance\\workspace';
					const workspaceDir = 'C:\\workspace\\service';
					const command = `cd /d ${instanceDir} && npm test`;
					const parameters = createRewriteParams(command, 'session-1');

					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: workspaceDir } }]
					} as any);
					const instance = createInstanceWithCwd({ fsPath: instanceDir } as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(parameters, instance, 'pwsh');

					strictEqual(result, 'npm test');
				});

				test('should handle cd /d flag with semicolon separator', async () => {
					const testDir = 'C:\\test\\workspace';
					const options = createRewriteParams(`cd /d ${testDir}; echo hello`, 'session-1');
					workspaceService.setWorkspace({
						folders: [{ uri: { fsPath: testDir } }]
					} as any);

					const result = await runInTerminalTool.rewriteCommandIfNeeded(options, undefined, 'pwsh');

					strictEqual(result, 'echo hello');
				});
			});
		});
	});
});
