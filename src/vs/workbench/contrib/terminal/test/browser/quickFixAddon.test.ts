/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { IAction } from 'vs/base/common/actions';
import { isWindows } from 'vs/base/common/platform';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITerminalCommand, ITerminalOutputMatcher, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { CommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/commandDetectionCapability';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { gitSimilar, freePort, FreePortOutputRegex, gitCreatePr, GitCreatePrOutputRegex, GitPushOutputRegex, gitPushSetUpstream, GitSimilarOutputRegex, gitTwoDashes, GitTwoDashesRegex } from 'vs/workbench/contrib/terminal/browser/terminalQuickFixBuiltinActions';
import { TerminalQuickFixAddon, getQuickFixesForCommand, convertToQuickFixOptions } from 'vs/workbench/contrib/terminal/browser/xterm/quickFixAddon';
import { URI } from 'vs/base/common/uri';
import { Terminal } from 'xterm';
import { ITerminalContributionService } from 'vs/workbench/contrib/terminal/common/terminalExtensionPoints';

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
		instantiationService.stub(ITerminalContributionService, { quickFixes: [] } as Partial<ITerminalContributionService>);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
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
			let output = `git: 'sttatus' is not a git command. See 'git --help'.

			The most similar command is
			status`;
			const exitCode = 1;
			const actions = [{
				id: 'Git Similar',
				enabled: true,
				label: 'Run: git status',
				tooltip: 'Run: git status',
				command: 'git status'
			}];
			setup(() => {
				const command = gitSimilar();
				expectedMap.set(command.commandLineMatcher.toString(), [command]);
				quickFixAddon.registerCommandFinishedListener(command);
			});
			suite('returns undefined when', () => {
				test('output does not match', () => {
					strictEqual(getQuickFixesForCommand(createCommand(command, `invalid output`, GitSimilarOutputRegex, exitCode), expectedMap, openerService), undefined);
				});
				test('command does not match', () => {
					strictEqual(getQuickFixesForCommand(createCommand(`gt sttatus`, output, GitSimilarOutputRegex, exitCode), expectedMap, openerService), undefined);
				});
			});
			suite('returns undefined when', () => {
				test('expected unix exit code', () => {
					assertMatchOptions(getQuickFixesForCommand(createCommand(command, output, GitSimilarOutputRegex, exitCode), expectedMap, openerService)?.fixes, actions);
				});
				test('matching exit status', () => {
					assertMatchOptions(getQuickFixesForCommand(createCommand(command, output, GitSimilarOutputRegex, 2), expectedMap, openerService)?.fixes, actions);
				});
			});
			suite('returns match', () => {
				test('returns match', () => {
					assertMatchOptions(getQuickFixesForCommand(createCommand(command, output, GitSimilarOutputRegex), expectedMap, openerService)?.fixes, actions);
				});

				test('returns multiple match', () => {
					output = `git: 'pu' is not a git command. See 'git --help'.

				The most similar commands are
						pull
						push`;
					const actions = [{
						id: 'Git Similar',
						enabled: true,
						label: 'Run: git pull',
						tooltip: 'Run: git pull',
						command: 'git pull'
					}, {
						id: 'Git Similar',
						enabled: true,
						label: 'Run: git push',
						tooltip: 'Run: git push',
						command: 'git push'
					}];
					assertMatchOptions(getQuickFixesForCommand(createCommand('git pu', output, GitSimilarOutputRegex), expectedMap, openerService)?.fixes, actions);
				});
				test('passes any arguments through', () => {
					output = `git: 'checkoutt' is not a git command. See 'git --help'.

				The most similar commands are
						checkout`;
					assertMatchOptions(getQuickFixesForCommand(createCommand('git checkoutt .', output, GitSimilarOutputRegex), expectedMap, openerService)?.fixes, [{
						id: 'Git Similar',
						enabled: true,
						label: 'Run: git checkout .',
						tooltip: 'Run: git checkout .',
						command: 'git checkout .'
					}]);
				});
			});
		});
		suite('gitTwoDashes', async () => {
			const expectedMap = new Map();
			const command = `git add . -all`;
			const output = 'error: did you mean `--all` (with two dashes)?';
			const exitCode = 1;
			const actions = [{
				id: 'Git Two Dashes',
				enabled: true,
				label: 'Run: git add . --all',
				tooltip: 'Run: git add . --all',
				command: 'git add . --all'
			}];
			setup(() => {
				const command = gitTwoDashes();
				expectedMap.set(command.commandLineMatcher.toString(), [command]);
				quickFixAddon.registerCommandFinishedListener(command);
			});
			suite('returns undefined when', () => {
				test('output does not match', () => {
					strictEqual(getQuickFixesForCommand(createCommand(command, `invalid output`, GitTwoDashesRegex, exitCode), expectedMap, openerService), undefined);
				});
				test('command does not match', () => {
					strictEqual(getQuickFixesForCommand(createCommand(`gt sttatus`, output, GitTwoDashesRegex, exitCode), expectedMap, openerService), undefined);
				});
			});
			suite('returns undefined when', () => {
				test('expected unix exit code', () => {
					assertMatchOptions(getQuickFixesForCommand(createCommand(command, output, GitTwoDashesRegex, exitCode), expectedMap, openerService)?.fixes, actions);
				});
				test('matching exit status', () => {
					assertMatchOptions(getQuickFixesForCommand(createCommand(command, output, GitTwoDashesRegex, 2), expectedMap, openerService)?.fixes, actions);
				});
			});
		});
		if (!isWindows) {
			suite('freePort', () => {
				const expectedMap = new Map();
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
					expectedMap.set(command.commandLineMatcher.toString(), [command]);
					quickFixAddon.registerCommandFinishedListener(command);
				});
				suite('returns undefined when', () => {
					test('output does not match', () => {
						strictEqual(getQuickFixesForCommand(createCommand(portCommand, `invalid output`, FreePortOutputRegex), expectedMap, openerService)?.fixes, undefined);
					});
				});
				test('returns actions', () => {
					assertMatchOptions(getQuickFixesForCommand(createCommand(portCommand, output, FreePortOutputRegex), expectedMap, openerService)?.fixes, actionOptions);
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
			const actions = [{
				id: 'Git Push Set Upstream',
				enabled: true,
				label: 'Run: git push --set-upstream origin test22',
				tooltip: 'Run: git push --set-upstream origin test22',
				command: 'git push --set-upstream origin test22'
			}];
			setup(() => {
				const command = convertToQuickFixOptions(gitPushSetUpstream());
				expectedMap.set(command.commandLineMatcher.toString(), [command]);
				quickFixAddon.registerCommandFinishedListener(command);
			});
			suite('returns undefined when', () => {
				test('output does not match', () => {
					strictEqual(getQuickFixesForCommand(createCommand(command, `invalid output`, GitPushOutputRegex, exitCode), expectedMap, openerService), undefined);
				});
				test('command does not match', () => {
					strictEqual(getQuickFixesForCommand(createCommand(`git status`, output, GitPushOutputRegex, exitCode), expectedMap, openerService), undefined);
				});
			});
			suite('returns actions when', () => {
				test('expected unix exit code', () => {
					assertMatchOptions(getQuickFixesForCommand(createCommand(command, output, GitPushOutputRegex, exitCode), expectedMap, openerService)?.fixes, actions);
				});
				test('matching exit status', () => {
					assertMatchOptions(getQuickFixesForCommand(createCommand(command, output, GitPushOutputRegex, 2), expectedMap, openerService)?.fixes, actions);
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
			const actions = [{
				id: `quickFix.opener`,
				enabled: true,
				label: 'Open: https://github.com/meganrogge/xterm.js/pull/new/test22',
				tooltip: 'Open: https://github.com/meganrogge/xterm.js/pull/new/test22',
				uri: URI.parse('https://github.com/meganrogge/xterm.js/pull/new/test22')
			}];
			setup(() => {
				const command = convertToQuickFixOptions(gitCreatePr());
				expectedMap.set(command.commandLineMatcher.toString(), [command]);
				quickFixAddon.registerCommandFinishedListener(command);
			});
			suite('returns undefined when', () => {
				test('output does not match', () => {
					strictEqual(getQuickFixesForCommand(createCommand(command, `invalid output`, GitCreatePrOutputRegex, exitCode), expectedMap, openerService), undefined);
				});
				test('command does not match', () => {
					strictEqual(getQuickFixesForCommand(createCommand(`git status`, output, GitCreatePrOutputRegex, exitCode), expectedMap, openerService), undefined);
				});
				test('failure exit status', () => {
					strictEqual(getQuickFixesForCommand(createCommand(command, output, GitCreatePrOutputRegex, 2), expectedMap, openerService), undefined);
				});
			});
			suite('returns actions when', () => {
				test('expected unix exit code', () => {
					assertMatchOptions(getQuickFixesForCommand(createCommand(command, output, GitCreatePrOutputRegex, exitCode), expectedMap, openerService)?.fixes, actions);
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
		const actions = [{
			id: 'Git Push Set Upstream',
			enabled: true,
			label: 'Run: git push --set-upstream origin test22',
			tooltip: 'Run: git push --set-upstream origin test22',
			command: 'git push --set-upstream origin test22'
		}];
		setup(() => {
			const pushCommand = convertToQuickFixOptions(gitPushSetUpstream());
			const prCommand = convertToQuickFixOptions(gitCreatePr());
			quickFixAddon.registerCommandFinishedListener(prCommand);
			expectedMap.set(pushCommand.commandLineMatcher.toString(), [pushCommand, prCommand]);
		});
		suite('returns undefined when', () => {
			test('output does not match', () => {
				strictEqual(getQuickFixesForCommand(createCommand(command, `invalid output`, GitPushOutputRegex, exitCode), expectedMap, openerService), undefined);
			});
			test('command does not match', () => {
				strictEqual(getQuickFixesForCommand(createCommand(`git status`, output, GitPushOutputRegex, exitCode), expectedMap, openerService), undefined);
			});
		});
		suite('returns actions when', () => {
			test('expected unix exit code', () => {
				assertMatchOptions(getQuickFixesForCommand(createCommand(command, output, GitPushOutputRegex, exitCode), expectedMap, openerService)?.fixes, actions);
			});
			test('matching exit status', () => {
				assertMatchOptions(getQuickFixesForCommand(createCommand(command, output, GitPushOutputRegex, 2), expectedMap, openerService)?.fixes, actions);
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

type TestAction = Pick<IAction, 'id' | 'label' | 'tooltip' | 'enabled'> & { command?: string; uri?: URI };
function assertMatchOptions(actual: TestAction[] | undefined, expected: TestAction[]): void {
	strictEqual(actual?.length, expected.length);
	let index = 0;
	for (const i of actual) {
		const j = expected[index];
		strictEqual(i.id, j.id, `ID`);
		strictEqual(i.enabled, j.enabled, `enabled`);
		strictEqual(i.label, j.label, `label`);
		strictEqual(i.tooltip, j.tooltip, `tooltip`);
		if (j.command) {
			strictEqual(i.command, j.command);
		}
		if (j.uri) {
			strictEqual(i.uri!.toString(), j.uri.toString());
		}
		index++;
	}
}
