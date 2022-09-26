/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITerminalCommand, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { CommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/commandDetectionCapability';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { ITerminalQuickFixAction, ITerminalInstance, ITerminalOutputMatcher } from 'vs/workbench/contrib/terminal/browser/terminal';
import { freePort, FreePortOutputRegex, gitCreatePr, GitCreatePrOutputRegex, GitPushOutputRegex, gitPushSetUpstream, gitSimilarCommand, GitSimilarOutputRegex } from 'vs/workbench/contrib/terminal/browser/terminalQuickFixBuiltinActions';
import { TerminalQuickFixAddon, getQuickFixes } from 'vs/workbench/contrib/terminal/browser/xterm/quickFixAddon';
import { Terminal } from 'xterm';

suite('QuickFixAddon', () => {
	let quickFixAddon: TerminalQuickFixAddon;
	let terminalInstance: Pick<ITerminalInstance, 'freePortKillProcess'>;
	let commandDetection: CommandDetectionCapability;
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
		commandDetection = instantiationService.createInstance(CommandDetectionCapability, xterm);
		capabilities.add(TerminalCapability.CommandDetection, commandDetection);
		instantiationService.stub(IContextMenuService, instantiationService.createInstance(ContextMenuService));
		openerService = instantiationService.createInstance(OpenerService);
		instantiationService.stub(IOpenerService, openerService);
		terminalInstance = {
			async freePortKillProcess(port: string): Promise<void> { }
		} as Pick<ITerminalInstance, 'freePortKillProcess'>;
		quickFixAddon = instantiationService.createInstance(TerminalQuickFixAddon, capabilities);
		xterm.loadAddon(quickFixAddon);
	});
	suite('registerCommandFinishedListener & getMatchActions', () => {
		suite('gitSimilarCommand', async () => {
			const expectedMap = new Map();
			const command = `git sttatus`;
			const output = `git: 'sttatus' is not a git command. See 'git --help'.

			The most similar command is
			status`;
			const exitCode = 1;
			const actions = [
				{
					id: 'terminal.gitSimilarCommand',
					label: 'Run git status',
					run: true,
					tooltip: 'Run git status',
					enabled: true
				}
			];
			setup(() => {
				const command = gitSimilarCommand();
				expectedMap.set(command.commandLineMatcher.toString(), [command]);
				quickFixAddon.registerCommandFinishedListener(command);
			});
			suite('returns undefined when', () => {
				test('output does not match', () => {
					strictEqual(getQuickFixes(createCommand(command, `invalid output`, GitSimilarOutputRegex, exitCode), expectedMap), undefined);
				});
				test('command does not match', () => {
					strictEqual(getQuickFixes(createCommand(`gt sttatus`, output, GitSimilarOutputRegex, exitCode), expectedMap), undefined);
				});
			});
			suite('returns undefined when', () => {
				test('expected unix exit code', () => {
					assertMatchOptions(getQuickFixes(createCommand(command, output, GitSimilarOutputRegex, exitCode), expectedMap), actions);
				});
				test('matching exit status', () => {
					assertMatchOptions(getQuickFixes(createCommand(command, output, GitSimilarOutputRegex, 2), expectedMap), actions);
				});
			});
		});
		if (!isWindows) {
			suite('freePort', () => {
				const expected = new Map();
				const portCommand = `yarn start dev`;
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
				const actionOptions = [{
					id: 'terminal.freePort',
					label: 'Free port 3000',
					run: true,
					tooltip: 'Free port 3000',
					enabled: true
				}];
				setup(() => {
					const command = freePort(terminalInstance);
					expected.set(command.commandLineMatcher.toString(), [command]);
					quickFixAddon.registerCommandFinishedListener(command);
				});
				suite('returns undefined when', () => {
					test('output does not match', () => {
						strictEqual(getQuickFixes(createCommand(portCommand, `invalid output`, FreePortOutputRegex), expected), undefined);
					});
				});
				test('returns actions', () => {
					assertMatchOptions(getQuickFixes(createCommand(portCommand, output, FreePortOutputRegex), expected), actionOptions);
				});
			});
		}

		suite('gitPushSetUpstream', () => {
			const expectedMap = new Map();
			const command = `git push`;
			const output = `fatal: The current branch test22 has no upstream branch.
			To push the current branch and set the remote as upstream, use

				git push --set-upstream origin test22`;
			const exitCode = 128;
			const actions = [
				{
					id: 'terminal.gitPush',
					label: 'Git push test22',
					run: true,
					tooltip: 'Git push test22',
					enabled: true
				}
			];
			setup(() => {
				const command = gitPushSetUpstream();
				expectedMap.set(command.commandLineMatcher.toString(), [command]);
				quickFixAddon.registerCommandFinishedListener(command);
			});
			suite('returns undefined when', () => {
				test('output does not match', () => {
					strictEqual(getQuickFixes(createCommand(command, `invalid output`, GitPushOutputRegex, exitCode), expectedMap), undefined);
				});
				test('command does not match', () => {
					strictEqual(getQuickFixes(createCommand(`git status`, output, GitPushOutputRegex, exitCode), expectedMap), undefined);
				});
			});
			suite('returns actions when', () => {
				test('expected unix exit code', () => {
					assertMatchOptions(getQuickFixes(createCommand(command, output, GitPushOutputRegex, exitCode), expectedMap), actions);
				});
				test('matching exit status', () => {
					assertMatchOptions(getQuickFixes(createCommand(command, output, GitPushOutputRegex, 2), expectedMap), actions);
				});
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
			const actions = [
				{
					id: 'terminal.gitCreatePr',
					label: 'Create PR',
					run: true,
					tooltip: 'Create PR',
					enabled: true
				}
			];
			setup(() => {
				const command = gitCreatePr(openerService);
				expectedMap.set(command.commandLineMatcher.toString(), [command]);
				quickFixAddon.registerCommandFinishedListener(command);
			});
			suite('returns undefined when', () => {
				test('output does not match', () => {
					strictEqual(getQuickFixes(createCommand(command, `invalid output`, GitCreatePrOutputRegex, exitCode), expectedMap), undefined);
				});
				test('command does not match', () => {
					strictEqual(getQuickFixes(createCommand(`git status`, output, GitCreatePrOutputRegex, exitCode), expectedMap), undefined);
				});
				test('failure exit status', () => {
					strictEqual(getQuickFixes(createCommand(command, output, GitCreatePrOutputRegex, 2), expectedMap), undefined);
				});
			});
			suite('returns actions when', () => {
				test('expected unix exit code', () => {
					assertMatchOptions(getQuickFixes(createCommand(command, output, GitCreatePrOutputRegex, exitCode), expectedMap), actions);
				});
			});
		});
	});
	suite('gitPush - multiple providers', () => {
		const expectedMap = new Map();
		const command = `git push`;
		const output = `fatal: The current branch test22 has no upstream branch.
		To push the current branch and set the remote as upstream, use

			git push --set-upstream origin test22`;
		const exitCode = 128;
		const actions = [
			{
				id: 'terminal.gitPush',
				label: 'Git push test22',
				run: true,
				tooltip: 'Git push test22',
				enabled: true
			}
		];
		setup(() => {
			const pushCommand = gitPushSetUpstream();
			const prCommand = gitCreatePr(openerService);
			quickFixAddon.registerCommandFinishedListener(pushCommand);
			quickFixAddon.registerCommandFinishedListener(prCommand);
			expectedMap.set(pushCommand.commandLineMatcher.toString(), [pushCommand, prCommand]);
		});
		suite('returns undefined when', () => {
			test('output does not match', () => {
				strictEqual(getQuickFixes(createCommand(command, `invalid output`, GitPushOutputRegex, exitCode), expectedMap), undefined);
			});
			test('command does not match', () => {
				strictEqual(getQuickFixes(createCommand(`git status`, output, GitPushOutputRegex, exitCode), expectedMap), undefined);
			});
		});
		suite('returns actions when', () => {
			test('expected unix exit code', () => {
				assertMatchOptions(getQuickFixes(createCommand(command, output, GitPushOutputRegex, exitCode), expectedMap), actions);
			});
			test('matching exit status', () => {
				assertMatchOptions(getQuickFixes(createCommand(command, output, GitPushOutputRegex, 2), expectedMap), actions);
			});
		});
	});
});

function createCommand(command: string, output: string, outputMatcher?: RegExp | string, exitCode?: number): ITerminalCommand {
	return {
		command,
		exitCode,
		getOutput: () => { return output; },
		getOutputMatch: (matcher: ITerminalOutputMatcher) => {
			if (outputMatcher) {
				return output.match(outputMatcher) ?? undefined;
			}
			return undefined;
		},
		timestamp: Date.now(),
		hasOutput: () => !!output
	};
}

function assertMatchOptions(actual: ITerminalQuickFixAction[] | undefined, expected: { id: string; label: string; run: boolean; tooltip: string; enabled: boolean }[]): void {
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
