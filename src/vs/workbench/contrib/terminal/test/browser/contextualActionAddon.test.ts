/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITerminalCommand, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { CommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/commandDetectionCapability';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { ITerminalInstance, ITerminalOutputMatcher } from 'vs/workbench/contrib/terminal/browser/terminal';
import { freePort, FreePortOutputRegex, gitCreatePr, GitCreatePrOutputRegex, GitPushOutputRegex, gitPushSetUpstream, gitSimilarCommand, GitSimilarOutputRegex } from 'vs/workbench/contrib/terminal/browser/terminalBaseContextualActions';
import { ContextualActionAddon, getMatchOptions, MatchActions } from 'vs/workbench/contrib/terminal/browser/xterm/contextualActionAddon';
import { ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import { Terminal } from 'xterm';

class TestCommandDetectionCapability extends CommandDetectionCapability { }

suite('ContextualActionAddon', () => {
	let contextualActionAddon: ContextualActionAddon;
	let terminalInstance: Partial<ITerminalInstance>;
	let commandDetection: TestCommandDetectionCapability;
	let openerService: OpenerService;
	setup(() => {
		const instantiationService = new TestInstantiationService();
		const xterm = new Terminal({
			allowProposedApi: true,
			cols: 80,
			rows: 30
		});
		const capabilities = new TerminalCapabilityStore();
		instantiationService.stub(ILogService, new NullLogService());
		commandDetection = instantiationService.createInstance(TestCommandDetectionCapability, xterm);
		capabilities.add(TerminalCapability.CommandDetection, commandDetection);
		instantiationService.stub(IContextMenuService, instantiationService.createInstance(ContextMenuService));
		openerService = instantiationService.createInstance(OpenerService);
		instantiationService.stub(IOpenerService, openerService);
		terminalInstance = {
			async sendText(text: string): Promise<void> { },
			get processManager(): Partial<ITerminalProcessManager> {
				return {
					freePortKillProcess(port: string) { }
				} as Pick<ITerminalProcessManager, 'freePortKillProcess'>;
			}
		} as Pick<ITerminalInstance, 'sendText' | 'processManager'>;
		contextualActionAddon = instantiationService.createInstance(ContextualActionAddon, capabilities);
		xterm.loadAddon(contextualActionAddon);
	});
	suite('registerCommandFinishedListener', () => {
		suite('gitSimilarCommand', async () => {
			const expectedMap = new Map();
			const command = `git sttatus`;
			const output = `git: 'sttatus' is not a git command. See 'git --help'.

			The most similar command is
					status `;
			const exitCode = 1;
			setup(() => {
				expectedMap.set(gitSimilarCommand(terminalInstance).commandLineMatcher.toString(), [gitSimilarCommand(terminalInstance)]);
				contextualActionAddon.registerCommandFinishedListener(gitSimilarCommand(terminalInstance));
			});
			suite('getMatchOptions should return undefined when', () => {
				test('output does not match', () => {
					strictEqual(getMatchOptions(createCommand(command, `invalid output`, GitSimilarOutputRegex, exitCode), expectedMap), undefined);
				});
				test('command does not match', () => {
					strictEqual(getMatchOptions(createCommand(`gt sttatus`, output, GitSimilarOutputRegex, exitCode), expectedMap), undefined);
				});
				test('exit code does not match', () => {
					strictEqual(getMatchOptions(createCommand(command, output, GitSimilarOutputRegex, 2), expectedMap), undefined);
				});
			});
			test('getMatchOptions should return match', () => {
				assertMatchOptions(
					getMatchOptions(
						createCommand(command, output, GitSimilarOutputRegex, exitCode), expectedMap),
					[
						{
							id: 'terminal.gitSimilarCommand',
							label: 'Run git status',
							run: true,
							tooltip: 'Run git status',
							enabled: true
						}
					]);
			});
		});
		suite('freePort', () => {
			const expected = new Map();
			const portCommand = `yarn start dev`;
			const exitCode = 1;
			const output = `yarn run v1.22.17
			warning ../../package.json: No license field
			Error: listen EADDRINUSE: address already in use 0.0.0.0:3000
				at Server.setupListenHandle [as _listen2] (node:net:1315:16)
				at listenInCluster (node:net:1363:12)
				at doListen (node:net:1501:7)
				at processTicksAndRejections (node:internal/process/task_queues:84:21)
			Emitted 'error' event on WebSocketServer instance at:
				at Server.emit (node:events:394:28)
				at emitErrorNT (node:net:1342:8)
				at processTicksAndRejections (node:internal/process/task_queues:83:21) {
			}
			error Command failed with exit code 1.
			info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.`;
			setup(() => {
				expected.set(freePort(terminalInstance).commandLineMatcher.toString(), [freePort(terminalInstance)]);
				contextualActionAddon.registerCommandFinishedListener(freePort(terminalInstance));
			});
			suite('getMatchOptions should return undefined when', () => {
				test('output does not match', () => {
					strictEqual(getMatchOptions(createCommand(portCommand, `invalid output`, FreePortOutputRegex, exitCode), expected), undefined);
				});
				test('exit code does not match', () => {
					strictEqual(getMatchOptions(createCommand(portCommand, output, FreePortOutputRegex, 2), expected), undefined);
				});
			});
			test('getMatchOptions should return match', () => {
				assertMatchOptions(
					getMatchOptions(
						createCommand(portCommand, output, FreePortOutputRegex, exitCode), expected),
					[{
						id: 'terminal.freePort',
						label: 'Free port 3000',
						run: true,
						tooltip: 'Free port 3000',
						enabled: true
					}]
				);
			});
		});
		suite('gitPushSetUpstream', () => {
			const expectedMap = new Map();
			const command = `git push`;
			const output = `fatal: The current branch test22 has no upstream branch.
			To push the current branch and set the remote as upstream, use

				git push --set-upstream origin test22 `;
			const exitCode = 128;
			setup(() => {
				expectedMap.set(gitPushSetUpstream(terminalInstance).commandLineMatcher.toString(), [gitPushSetUpstream(terminalInstance)]);
				contextualActionAddon.registerCommandFinishedListener(gitPushSetUpstream(terminalInstance));
			});
			suite('getMatchOptions should return undefined when', () => {
				test('output does not match', () => {
					strictEqual(getMatchOptions(createCommand(command, `invalid output`, GitPushOutputRegex, exitCode), expectedMap), undefined);
				});
				test('command does not match', () => {
					strictEqual(getMatchOptions(createCommand(`git status`, output, GitPushOutputRegex, exitCode), expectedMap), undefined);
				});
				test('exit code does not match', () => {
					strictEqual(getMatchOptions(createCommand(command, output, GitPushOutputRegex, 2), expectedMap), undefined);
				});
			});
			test('getMatchOptions should return match', () => {
				assertMatchOptions(
					getMatchOptions(
						createCommand(command, output, GitPushOutputRegex, exitCode), expectedMap),
					[
						{
							id: 'terminal.gitPush',
							label: 'Git push test22',
							run: true,
							tooltip: 'Git push test22',
							enabled: true
						}
					]);
			});
		});
		suite('gitCreatePr', () => {
			const expectedMap = new Map();
			const command = `git push`;
			const output = `Total 0 (delta 0), reused 0 (delta 0), pack-reused 0
			remote:
			remote: Create a pull request for 'test22' on GitHub by visiting:
			remote:      https://github.com/meganrogge/xterm.js/pull/new/test22
			remote:
			To https://github.com/meganrogge/xterm.js
			 * [new branch]        test22 -> test22
			Branch 'test22' set up to track remote branch 'test22' from 'origin'. `;
			const exitCode = 0;
			setup(() => {
				expectedMap.set(gitCreatePr(openerService).commandLineMatcher.toString(), [gitCreatePr(openerService)]);
				contextualActionAddon.registerCommandFinishedListener(gitCreatePr(openerService));
			});
			suite('getMatchOptions should return undefined when', () => {
				test('output does not match', () => {
					strictEqual(getMatchOptions(createCommand(command, `invalid output`, GitCreatePrOutputRegex, exitCode), expectedMap), undefined);
				});
				test('command does not match', () => {
					strictEqual(getMatchOptions(createCommand(`git status`, output, GitCreatePrOutputRegex, exitCode), expectedMap), undefined);
				});
				test('exit code does not match', () => {
					strictEqual(getMatchOptions(createCommand(command, output, GitCreatePrOutputRegex, 2), expectedMap), undefined);
				});
			});
			test('getMatchOptions should return match', () => {
				assertMatchOptions(
					getMatchOptions(
						createCommand(command, output, GitCreatePrOutputRegex, exitCode), expectedMap),
					[
						{
							id: 'terminal.gitCreatePr',
							label: 'Create PR',
							run: true,
							tooltip: 'Create PR',
							enabled: true
						}
					]);
			});
		});
	});
});

function createCommand(command: string, output: string, outputMatcher?: RegExp | string, exitCode?: number): ITerminalCommand {
	return {
		command,
		exitCode,
		getOutput: (matcher: ITerminalOutputMatcher) => {
			if (outputMatcher) {
				return output.match(outputMatcher) ?? undefined;
			}
			return undefined;
		},
		timestamp: Date.now(),
		hasOutput: () => !!output
	};
}

function assertMatchOptions(actual: MatchActions, expected: { id: string; label: string; run: boolean; tooltip: string; enabled: boolean }[]): void {
	strictEqual(actual?.length, expected.length);
	let index = 0;
	for (const i of actual) {
		const j = expected[index];
		strictEqual(i.id, j.id, `ID`);
		strictEqual(i.enabled, j.enabled, `enabled`);
		strictEqual(i.label, j.label, `label`);
		strictEqual(!!i.run, j.run, `run`);
		strictEqual(i.tooltip, j.tooltip, `tooltip`);
		index++;
	}
}
