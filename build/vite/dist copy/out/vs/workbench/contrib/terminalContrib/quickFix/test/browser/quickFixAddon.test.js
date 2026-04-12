/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { Event } from '../../../../../../base/common/event.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestCommandService } from '../../../../../../editor/test/browser/editorTestServices.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextMenuService } from '../../../../../../platform/contextview/browser/contextMenuService.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { CommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { ITerminalQuickFixService } from '../../browser/quickFix.js';
import { getQuickFixesForCommand, TerminalQuickFixAddon } from '../../browser/quickFixAddon.js';
import { freePort, FreePortOutputRegex, gitCreatePr, GitCreatePrOutputRegex, gitFastForwardPull, GitFastForwardPullOutputRegex, GitPushOutputRegex, gitPushSetUpstream, gitSimilar, GitSimilarOutputRegex, gitTwoDashes, GitTwoDashesRegex, pwshGeneralError, PwshGeneralErrorOutputRegex, pwshUnixCommandNotFoundError, PwshUnixCommandNotFoundErrorOutputRegex } from '../../browser/terminalQuickFixBuiltinActions.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { TestXtermLogger } from '../../../../../../platform/terminal/test/common/terminalTestHelpers.js';
suite('QuickFixAddon', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let quickFixAddon;
    let commandDetection;
    let commandService;
    let openerService;
    let labelService;
    let terminal;
    let instantiationService;
    setup(async () => {
        instantiationService = store.add(new TestInstantiationService());
        const TerminalCtor = (await importAMDNodeModule('@xterm/xterm', 'lib/xterm.js')).Terminal;
        terminal = store.add(new TerminalCtor({
            allowProposedApi: true,
            cols: 80,
            rows: 30,
            logger: TestXtermLogger
        }));
        instantiationService.stub(IStorageService, store.add(new TestStorageService()));
        instantiationService.stub(ITerminalQuickFixService, {
            onDidRegisterProvider: Event.None,
            onDidUnregisterProvider: Event.None,
            onDidRegisterCommandSelector: Event.None,
            extensionQuickFixes: Promise.resolve([])
        });
        instantiationService.stub(IConfigurationService, new TestConfigurationService());
        labelService = instantiationService.stub(ILabelService, {});
        const capabilities = store.add(new TerminalCapabilityStore());
        instantiationService.stub(ILogService, new NullLogService());
        commandDetection = store.add(instantiationService.createInstance(CommandDetectionCapability, terminal));
        capabilities.add(2 /* TerminalCapability.CommandDetection */, commandDetection);
        instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
        openerService = instantiationService.stub(IOpenerService, {});
        commandService = new TestCommandService(instantiationService);
        quickFixAddon = instantiationService.createInstance(TerminalQuickFixAddon, generateUuid(), [], capabilities);
        terminal.loadAddon(quickFixAddon);
    });
    suite('registerCommandFinishedListener & getMatchActions', () => {
        suite('gitSimilarCommand', () => {
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
            const outputLines = output.split('\n');
            setup(() => {
                const command = gitSimilar();
                expectedMap.set(command.commandLineMatcher.toString(), [command]);
                quickFixAddon.registerCommandFinishedListener(command);
            });
            suite('returns undefined when', () => {
                test('output does not match', async () => {
                    strictEqual(await (getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitSimilarOutputRegex, exitCode, [`invalid output`]), expectedMap, commandService, openerService, labelService)), undefined);
                });
                test('command does not match', async () => {
                    strictEqual(await (getQuickFixesForCommand([], terminal, createCommand(`gt sttatus`, output, GitSimilarOutputRegex, exitCode, outputLines), expectedMap, commandService, openerService, labelService)), undefined);
                });
            });
            suite('returns actions when', () => {
                test('expected unix exit code', async () => {
                    assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand(command, output, GitSimilarOutputRegex, exitCode, outputLines), expectedMap, commandService, openerService, labelService)), actions);
                });
                test('matching exit status', async () => {
                    assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand(command, output, GitSimilarOutputRegex, 2, outputLines), expectedMap, commandService, openerService, labelService)), actions);
                });
            });
            suite('returns match', () => {
                test('returns match', async () => {
                    assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand(command, output, GitSimilarOutputRegex, exitCode, outputLines), expectedMap, commandService, openerService, labelService)), actions);
                });
                test('returns multiple match', async () => {
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
                    assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand('git pu', output, GitSimilarOutputRegex, exitCode, output.split('\n')), expectedMap, commandService, openerService, labelService)), actions);
                });
                test('passes any arguments through', async () => {
                    output = `git: 'checkoutt' is not a git command. See 'git --help'.
				The most similar commands are
						checkout`;
                    assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand('git checkoutt .', output, GitSimilarOutputRegex, exitCode, output.split('\n')), expectedMap, commandService, openerService, labelService)), [{
                            id: 'Git Similar',
                            enabled: true,
                            label: 'Run: git checkout .',
                            tooltip: 'Run: git checkout .',
                            command: 'git checkout .'
                        }]);
                });
            });
        });
        suite('gitTwoDashes', () => {
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
                test('output does not match', async () => {
                    strictEqual((await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitTwoDashesRegex, exitCode), expectedMap, commandService, openerService, labelService)), undefined);
                });
                test('command does not match', async () => {
                    strictEqual((await getQuickFixesForCommand([], terminal, createCommand(`gt sttatus`, output, GitTwoDashesRegex, exitCode), expectedMap, commandService, openerService, labelService)), undefined);
                });
            });
            suite('returns actions when', () => {
                test('expected unix exit code', async () => {
                    assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand(command, output, GitTwoDashesRegex, exitCode), expectedMap, commandService, openerService, labelService)), actions);
                });
                test('matching exit status', async () => {
                    assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand(command, output, GitTwoDashesRegex, 2), expectedMap, commandService, openerService, labelService)), actions);
                });
            });
        });
        suite('gitFastForwardPull', () => {
            const expectedMap = new Map();
            const command = `git checkout vnext`;
            const output = 'Already on \'vnext\' \n Your branch is behind \'origin/vnext\' by 1 commit, and can be fast-forwarded.';
            const exitCode = 0;
            const actions = [{
                    id: 'Git Fast Forward Pull',
                    enabled: true,
                    label: 'Run: git pull',
                    tooltip: 'Run: git pull',
                    command: 'git pull'
                }];
            setup(() => {
                const command = gitFastForwardPull();
                expectedMap.set(command.commandLineMatcher.toString(), [command]);
                quickFixAddon.registerCommandFinishedListener(command);
            });
            suite('returns undefined when', () => {
                test('output does not match', async () => {
                    strictEqual((await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitFastForwardPullOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), undefined);
                });
                test('command does not match', async () => {
                    strictEqual((await getQuickFixesForCommand([], terminal, createCommand(`gt add`, output, GitFastForwardPullOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), undefined);
                });
                test('exit code does not match', async () => {
                    strictEqual((await getQuickFixesForCommand([], terminal, createCommand(command, output, GitFastForwardPullOutputRegex, 2), expectedMap, commandService, openerService, labelService)), undefined);
                });
            });
            suite('returns actions when', () => {
                test('matching exit status, command, ouput', async () => {
                    assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand(command, output, GitFastForwardPullOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), actions);
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
                        id: 'Free Port',
                        label: 'Free port 3000',
                        run: true,
                        tooltip: 'Free port 3000',
                        enabled: true
                    }];
                setup(() => {
                    const command = freePort(() => Promise.resolve());
                    expectedMap.set(command.commandLineMatcher.toString(), [command]);
                    quickFixAddon.registerCommandFinishedListener(command);
                });
                suite('returns undefined when', () => {
                    test('output does not match', async () => {
                        strictEqual((await getQuickFixesForCommand([], terminal, createCommand(portCommand, `invalid output`, FreePortOutputRegex), expectedMap, commandService, openerService, labelService)), undefined);
                    });
                });
                test('returns actions', async () => {
                    assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand(portCommand, output, FreePortOutputRegex), expectedMap, commandService, openerService, labelService)), actionOptions);
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
                const command = gitPushSetUpstream();
                expectedMap.set(command.commandLineMatcher.toString(), [command]);
                quickFixAddon.registerCommandFinishedListener(command);
            });
            suite('returns undefined when', () => {
                test('output does not match', async () => {
                    strictEqual((await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), undefined);
                });
                test('command does not match', async () => {
                    strictEqual((await getQuickFixesForCommand([], terminal, createCommand(`git status`, output, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), undefined);
                });
            });
            suite('returns actions when', () => {
                test('expected unix exit code', async () => {
                    assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand(command, output, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), actions);
                });
                test('matching exit status', async () => {
                    assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand(command, output, GitPushOutputRegex, 2), expectedMap, commandService, openerService, labelService)), actions);
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
                    id: 'Git Create Pr',
                    enabled: true,
                    label: 'Open: https://github.com/meganrogge/xterm.js/pull/new/test22',
                    tooltip: 'Open: https://github.com/meganrogge/xterm.js/pull/new/test22',
                    uri: URI.parse('https://github.com/meganrogge/xterm.js/pull/new/test22')
                }];
            setup(() => {
                const command = gitCreatePr();
                expectedMap.set(command.commandLineMatcher.toString(), [command]);
                quickFixAddon.registerCommandFinishedListener(command);
            });
            suite('returns undefined when', () => {
                test('output does not match', async () => {
                    strictEqual((await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitCreatePrOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), undefined);
                });
                test('command does not match', async () => {
                    strictEqual((await getQuickFixesForCommand([], terminal, createCommand(`git status`, output, GitCreatePrOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), undefined);
                });
                test('failure exit status', async () => {
                    strictEqual((await getQuickFixesForCommand([], terminal, createCommand(command, output, GitCreatePrOutputRegex, 2), expectedMap, commandService, openerService, labelService)), undefined);
                });
            });
            suite('returns actions when', () => {
                test('expected unix exit code', async () => {
                    assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand(command, output, GitCreatePrOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), actions);
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
            const pushCommand = gitPushSetUpstream();
            const prCommand = gitCreatePr();
            quickFixAddon.registerCommandFinishedListener(prCommand);
            expectedMap.set(pushCommand.commandLineMatcher.toString(), [pushCommand, prCommand]);
        });
        suite('returns undefined when', () => {
            test('output does not match', async () => {
                strictEqual((await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), undefined);
            });
            test('command does not match', async () => {
                strictEqual((await getQuickFixesForCommand([], terminal, createCommand(`git status`, output, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), undefined);
            });
        });
        suite('returns actions when', () => {
            test('expected unix exit code', async () => {
                assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand(command, output, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), actions);
            });
            test('matching exit status', async () => {
                assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand(command, output, GitPushOutputRegex, 2), expectedMap, commandService, openerService, labelService)), actions);
            });
        });
    });
    suite('pwsh feedback providers', () => {
        suite('General', () => {
            const expectedMap = new Map();
            const command = `not important`;
            const output = [
                `...`,
                ``,
                `Suggestion [General]:`,
                `  The most similar commands are: python3, python3m, pamon, python3.6, rtmon, echo, pushd, etsn, pwsh, pwconv.`,
                ``,
                `Suggestion [cmd-not-found]:`,
                `  Command 'python' not found, but can be installed with:`,
                `  sudo apt install python3`,
                `  sudo apt install python`,
                `  sudo apt install python-minimal`,
                `  You also have python3 installed, you can run 'python3' instead.'`,
                ``,
            ].join('\n');
            const exitCode = 128;
            const actions = [
                'python3',
                'python3m',
                'pamon',
                'python3.6',
                'rtmon',
                'echo',
                'pushd',
                'etsn',
                'pwsh',
                'pwconv',
            ].map(command => {
                return {
                    id: 'Pwsh General Error',
                    enabled: true,
                    label: `Run: ${command}`,
                    tooltip: `Run: ${command}`,
                    command: command
                };
            });
            setup(() => {
                const pushCommand = pwshGeneralError();
                quickFixAddon.registerCommandFinishedListener(pushCommand);
                expectedMap.set(pushCommand.commandLineMatcher.toString(), [pushCommand]);
            });
            test('returns undefined when output does not match', async () => {
                strictEqual((await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, PwshGeneralErrorOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), undefined);
            });
            test('returns actions when output matches', async () => {
                assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand(command, output, PwshGeneralErrorOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), actions);
            });
        });
        suite('Unix cmd-not-found', () => {
            const expectedMap = new Map();
            const command = `not important`;
            const output = [
                `...`,
                ``,
                `Suggestion [General]`,
                `  The most similar commands are: python3, python3m, pamon, python3.6, rtmon, echo, pushd, etsn, pwsh, pwconv.`,
                ``,
                `Suggestion [cmd-not-found]:`,
                `  Command 'python' not found, but can be installed with:`,
                `  sudo apt install python3`,
                `  sudo apt install python`,
                `  sudo apt install python-minimal`,
                `  You also have python3 installed, you can run 'python3' instead.'`,
                ``,
            ].join('\n');
            const exitCode = 128;
            const actions = [
                'sudo apt install python3',
                'sudo apt install python',
                'sudo apt install python-minimal',
                'python3',
            ].map(command => {
                return {
                    id: 'Pwsh Unix Command Not Found Error',
                    enabled: true,
                    label: `Run: ${command}`,
                    tooltip: `Run: ${command}`,
                    command: command
                };
            });
            setup(() => {
                const pushCommand = pwshUnixCommandNotFoundError();
                quickFixAddon.registerCommandFinishedListener(pushCommand);
                expectedMap.set(pushCommand.commandLineMatcher.toString(), [pushCommand]);
            });
            test('returns undefined when output does not match', async () => {
                strictEqual((await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, PwshUnixCommandNotFoundErrorOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), undefined);
            });
            test('returns actions when output matches', async () => {
                assertMatchOptions((await getQuickFixesForCommand([], terminal, createCommand(command, output, PwshUnixCommandNotFoundErrorOutputRegex, exitCode), expectedMap, commandService, openerService, labelService)), actions);
            });
        });
    });
});
function createCommand(command, output, outputMatcher, exitCode, outputLines) {
    return {
        cwd: '',
        commandStartLineContent: '',
        markProperties: {},
        executedX: undefined,
        startX: undefined,
        command,
        isTrusted: true,
        exitCode,
        getOutput: () => { return output; },
        getOutputMatch: (_matcher) => {
            if (outputMatcher) {
                const regexMatch = output.match(outputMatcher) ?? undefined;
                if (regexMatch) {
                    return outputLines ? { regexMatch, outputLines } : { regexMatch, outputLines: [] };
                }
            }
            return undefined;
        },
        timestamp: Date.now(),
        hasOutput: () => !!output
    };
}
function assertMatchOptions(actual, expected) {
    strictEqual(actual?.length, expected.length);
    for (let i = 0; i < expected.length; i++) {
        const expectedItem = expected[i];
        const actualItem = actual[i];
        strictEqual(actualItem.id, expectedItem.id, `ID`);
        strictEqual(actualItem.enabled, expectedItem.enabled, `enabled`);
        strictEqual(actualItem.label, expectedItem.label, `label`);
        strictEqual(actualItem.tooltip, expectedItem.tooltip, `tooltip`);
        if (expectedItem.command) {
            strictEqual(actualItem.command, expectedItem.command);
        }
        if (expectedItem.uri) {
            strictEqual(actualItem.uri.toString(), expectedItem.uri.toString());
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tGaXhBZGRvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3F1aWNrRml4L3Rlc3QvYnJvd3Nlci9xdWlja0ZpeEFkZG9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUNyQyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUVoRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNqRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUMxRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNwRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDakYsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMzRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDcEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXZGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHVGQUF1RixDQUFDO0FBQ25JLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG9GQUFvRixDQUFDO0FBRTdILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3JFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsbUJBQW1CLEVBQUUsV0FBVyxFQUFFLHNCQUFzQixFQUFFLGtCQUFrQixFQUFFLDZCQUE2QixFQUFFLGtCQUFrQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxxQkFBcUIsRUFBRSxZQUFZLEVBQUUsaUJBQWlCLEVBQUUsZ0JBQWdCLEVBQUUsMkJBQTJCLEVBQUUsNEJBQTRCLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUMxWixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDckUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBRXpHLEtBQUssQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFO0lBQzNCLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsSUFBSSxhQUFvQyxDQUFDO0lBQ3pDLElBQUksZ0JBQTRDLENBQUM7SUFDakQsSUFBSSxjQUFrQyxDQUFDO0lBQ3ZDLElBQUksYUFBNkIsQ0FBQztJQUNsQyxJQUFJLFlBQTJCLENBQUM7SUFDaEMsSUFBSSxRQUFrQixDQUFDO0lBQ3ZCLElBQUksb0JBQThDLENBQUM7SUFFbkQsS0FBSyxDQUFDLEtBQUssSUFBSSxFQUFFO1FBQ2hCLG9CQUFvQixHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSx3QkFBd0IsRUFBRSxDQUFDLENBQUM7UUFDakUsTUFBTSxZQUFZLEdBQUcsQ0FBQyxNQUFNLG1CQUFtQixDQUFnQyxjQUFjLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7UUFDekgsUUFBUSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxZQUFZLENBQUM7WUFDckMsZ0JBQWdCLEVBQUUsSUFBSTtZQUN0QixJQUFJLEVBQUUsRUFBRTtZQUNSLElBQUksRUFBRSxFQUFFO1lBQ1IsTUFBTSxFQUFFLGVBQWU7U0FDdkIsQ0FBQyxDQUFDLENBQUM7UUFDSixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoRixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUU7WUFDbkQscUJBQXFCLEVBQUUsS0FBSyxDQUFDLElBQUk7WUFDakMsdUJBQXVCLEVBQUUsS0FBSyxDQUFDLElBQUk7WUFDbkMsNEJBQTRCLEVBQUUsS0FBSyxDQUFDLElBQUk7WUFDeEMsbUJBQW1CLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7U0FDSCxDQUFDLENBQUM7UUFDeEMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLElBQUksd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1FBQ2pGLFlBQVksR0FBRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLEVBQTRCLENBQUMsQ0FBQztRQUN0RixNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO1FBQzlELG9CQUFvQixDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBQzdELGdCQUFnQixHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDBCQUEwQixFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDeEcsWUFBWSxDQUFDLEdBQUcsOENBQXNDLGdCQUFnQixDQUFDLENBQUM7UUFDeEUsb0JBQW9CLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25ILGFBQWEsR0FBRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLEVBQTZCLENBQUMsQ0FBQztRQUN6RixjQUFjLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBRTlELGFBQWEsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMscUJBQXFCLEVBQUUsWUFBWSxFQUFFLEVBQUUsRUFBRSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQzdHLFFBQVEsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDbkMsQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsbURBQW1ELEVBQUUsR0FBRyxFQUFFO1FBQy9ELEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxHQUFHLEVBQUU7WUFDL0IsTUFBTSxXQUFXLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUM5QixNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUM7WUFDOUIsSUFBSSxNQUFNLEdBQUc7OztVQUdOLENBQUM7WUFDUixNQUFNLFFBQVEsR0FBRyxDQUFDLENBQUM7WUFDbkIsTUFBTSxPQUFPLEdBQUcsQ0FBQztvQkFDaEIsRUFBRSxFQUFFLGFBQWE7b0JBQ2pCLE9BQU8sRUFBRSxJQUFJO29CQUNiLEtBQUssRUFBRSxpQkFBaUI7b0JBQ3hCLE9BQU8sRUFBRSxpQkFBaUI7b0JBQzFCLE9BQU8sRUFBRSxZQUFZO2lCQUNyQixDQUFDLENBQUM7WUFDSCxNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3ZDLEtBQUssQ0FBQyxHQUFHLEVBQUU7Z0JBQ1YsTUFBTSxPQUFPLEdBQUcsVUFBVSxFQUFFLENBQUM7Z0JBQzdCLFdBQVcsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDbEUsYUFBYSxDQUFDLCtCQUErQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3hELENBQUMsQ0FBQyxDQUFDO1lBQ0gsS0FBSyxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtnQkFDcEMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEtBQUssSUFBSSxFQUFFO29CQUN4QyxXQUFXLENBQUMsTUFBTSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsYUFBYSxDQUFDLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxxQkFBcUIsRUFBRSxRQUFRLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDaE8sQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxDQUFDLHdCQUF3QixFQUFFLEtBQUssSUFBSSxFQUFFO29CQUN6QyxXQUFXLENBQUMsTUFBTSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsYUFBYSxDQUFDLFlBQVksRUFBRSxNQUFNLEVBQUUscUJBQXFCLEVBQUUsUUFBUSxFQUFFLFdBQVcsQ0FBQyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQ3BOLENBQUMsQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUM7WUFDSCxLQUFLLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO2dCQUNsQyxJQUFJLENBQUMseUJBQXlCLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQzFDLGtCQUFrQixDQUFDLENBQUMsTUFBTSx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLGFBQWEsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLHFCQUFxQixFQUFFLFFBQVEsRUFBRSxXQUFXLENBQUMsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxZQUFZLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUNwTixDQUFDLENBQUMsQ0FBQztnQkFDSCxJQUFJLENBQUMsc0JBQXNCLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQ3ZDLGtCQUFrQixDQUFDLENBQUMsTUFBTSx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLGFBQWEsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLHFCQUFxQixFQUFFLENBQUMsRUFBRSxXQUFXLENBQUMsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxZQUFZLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUM3TSxDQUFDLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1lBQ0gsS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7Z0JBQzNCLElBQUksQ0FBQyxlQUFlLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQ2hDLGtCQUFrQixDQUFDLENBQUMsTUFBTSx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLGFBQWEsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLHFCQUFxQixFQUFFLFFBQVEsRUFBRSxXQUFXLENBQUMsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxZQUFZLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUNwTixDQUFDLENBQUMsQ0FBQztnQkFFSCxJQUFJLENBQUMsd0JBQXdCLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQ3pDLE1BQU0sR0FBRzs7O1dBR0gsQ0FBQztvQkFDUCxNQUFNLE9BQU8sR0FBRyxDQUFDOzRCQUNoQixFQUFFLEVBQUUsYUFBYTs0QkFDakIsT0FBTyxFQUFFLElBQUk7NEJBQ2IsS0FBSyxFQUFFLGVBQWU7NEJBQ3RCLE9BQU8sRUFBRSxlQUFlOzRCQUN4QixPQUFPLEVBQUUsVUFBVTt5QkFDbkIsRUFBRTs0QkFDRixFQUFFLEVBQUUsYUFBYTs0QkFDakIsT0FBTyxFQUFFLElBQUk7NEJBQ2IsS0FBSyxFQUFFLGVBQWU7NEJBQ3RCLE9BQU8sRUFBRSxlQUFlOzRCQUN4QixPQUFPLEVBQUUsVUFBVTt5QkFDbkIsQ0FBQyxDQUFDO29CQUNILGtCQUFrQixDQUFDLENBQUMsTUFBTSx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLGFBQWEsQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLHFCQUFxQixFQUFFLFFBQVEsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDNU4sQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxDQUFDLDhCQUE4QixFQUFFLEtBQUssSUFBSSxFQUFFO29CQUMvQyxNQUFNLEdBQUc7O2VBRUMsQ0FBQztvQkFDWCxrQkFBa0IsQ0FBQyxDQUFDLE1BQU0sdUJBQXVCLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxhQUFhLENBQUMsaUJBQWlCLEVBQUUsTUFBTSxFQUFFLHFCQUFxQixFQUFFLFFBQVEsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUMsRUFBRSxDQUFDOzRCQUMzTixFQUFFLEVBQUUsYUFBYTs0QkFDakIsT0FBTyxFQUFFLElBQUk7NEJBQ2IsS0FBSyxFQUFFLHFCQUFxQjs0QkFDNUIsT0FBTyxFQUFFLHFCQUFxQjs0QkFDOUIsT0FBTyxFQUFFLGdCQUFnQjt5QkFDekIsQ0FBQyxDQUFDLENBQUM7Z0JBQ0wsQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBQ0gsS0FBSyxDQUFDLGNBQWMsRUFBRSxHQUFHLEVBQUU7WUFDMUIsTUFBTSxXQUFXLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUM5QixNQUFNLE9BQU8sR0FBRyxnQkFBZ0IsQ0FBQztZQUNqQyxNQUFNLE1BQU0sR0FBRyxnREFBZ0QsQ0FBQztZQUNoRSxNQUFNLFFBQVEsR0FBRyxDQUFDLENBQUM7WUFDbkIsTUFBTSxPQUFPLEdBQUcsQ0FBQztvQkFDaEIsRUFBRSxFQUFFLGdCQUFnQjtvQkFDcEIsT0FBTyxFQUFFLElBQUk7b0JBQ2IsS0FBSyxFQUFFLHNCQUFzQjtvQkFDN0IsT0FBTyxFQUFFLHNCQUFzQjtvQkFDL0IsT0FBTyxFQUFFLGlCQUFpQjtpQkFDMUIsQ0FBQyxDQUFDO1lBQ0gsS0FBSyxDQUFDLEdBQUcsRUFBRTtnQkFDVixNQUFNLE9BQU8sR0FBRyxZQUFZLEVBQUUsQ0FBQztnQkFDL0IsV0FBVyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUNsRSxhQUFhLENBQUMsK0JBQStCLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDeEQsQ0FBQyxDQUFDLENBQUM7WUFDSCxLQUFLLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO2dCQUNwQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQ3hDLFdBQVcsQ0FBQyxDQUFDLE1BQU0sdUJBQXVCLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxhQUFhLENBQUMsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGlCQUFpQixFQUFFLFFBQVEsQ0FBQyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQ3hNLENBQUMsQ0FBQyxDQUFDO2dCQUNILElBQUksQ0FBQyx3QkFBd0IsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDekMsV0FBVyxDQUFDLENBQUMsTUFBTSx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLGFBQWEsQ0FBQyxZQUFZLEVBQUUsTUFBTSxFQUFFLGlCQUFpQixFQUFFLFFBQVEsQ0FBQyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQ25NLENBQUMsQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUM7WUFDSCxLQUFLLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO2dCQUNsQyxJQUFJLENBQUMseUJBQXlCLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQzFDLGtCQUFrQixDQUFDLENBQUMsTUFBTSx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLGFBQWEsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLGlCQUFpQixFQUFFLFFBQVEsQ0FBQyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ25NLENBQUMsQ0FBQyxDQUFDO2dCQUNILElBQUksQ0FBQyxzQkFBc0IsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDdkMsa0JBQWtCLENBQUMsQ0FBQyxNQUFNLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsYUFBYSxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDNUwsQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBQ0gsS0FBSyxDQUFDLG9CQUFvQixFQUFFLEdBQUcsRUFBRTtZQUNoQyxNQUFNLFdBQVcsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1lBQzlCLE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDO1lBQ3JDLE1BQU0sTUFBTSxHQUFHLHdHQUF3RyxDQUFDO1lBQ3hILE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQztZQUNuQixNQUFNLE9BQU8sR0FBRyxDQUFDO29CQUNoQixFQUFFLEVBQUUsdUJBQXVCO29CQUMzQixPQUFPLEVBQUUsSUFBSTtvQkFDYixLQUFLLEVBQUUsZUFBZTtvQkFDdEIsT0FBTyxFQUFFLGVBQWU7b0JBQ3hCLE9BQU8sRUFBRSxVQUFVO2lCQUNuQixDQUFDLENBQUM7WUFDSCxLQUFLLENBQUMsR0FBRyxFQUFFO2dCQUNWLE1BQU0sT0FBTyxHQUFHLGtCQUFrQixFQUFFLENBQUM7Z0JBQ3JDLFdBQVcsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDbEUsYUFBYSxDQUFDLCtCQUErQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3hELENBQUMsQ0FBQyxDQUFDO1lBQ0gsS0FBSyxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtnQkFDcEMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEtBQUssSUFBSSxFQUFFO29CQUN4QyxXQUFXLENBQUMsQ0FBQyxNQUFNLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsYUFBYSxDQUFDLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSw2QkFBNkIsRUFBRSxRQUFRLENBQUMsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxZQUFZLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUNwTixDQUFDLENBQUMsQ0FBQztnQkFDSCxJQUFJLENBQUMsd0JBQXdCLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQ3pDLFdBQVcsQ0FBQyxDQUFDLE1BQU0sdUJBQXVCLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxhQUFhLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSw2QkFBNkIsRUFBRSxRQUFRLENBQUMsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxZQUFZLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUMzTSxDQUFDLENBQUMsQ0FBQztnQkFDSCxJQUFJLENBQUMsMEJBQTBCLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQzNDLFdBQVcsQ0FBQyxDQUFDLE1BQU0sdUJBQXVCLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxhQUFhLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSw2QkFBNkIsRUFBRSxDQUFDLENBQUMsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxZQUFZLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUNuTSxDQUFDLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1lBQ0gsS0FBSyxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtnQkFDbEMsSUFBSSxDQUFDLHNDQUFzQyxFQUFFLEtBQUssSUFBSSxFQUFFO29CQUN2RCxrQkFBa0IsQ0FBQyxDQUFDLE1BQU0sdUJBQXVCLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxhQUFhLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSw2QkFBNkIsRUFBRSxRQUFRLENBQUMsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxZQUFZLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUMvTSxDQUFDLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDaEIsS0FBSyxDQUFDLFVBQVUsRUFBRSxHQUFHLEVBQUU7Z0JBQ3RCLE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7Z0JBQzlCLE1BQU0sV0FBVyxHQUFHLGdCQUFnQixDQUFDO2dCQUNyQyxNQUFNLE1BQU0sR0FBRzs7Ozs7Ozs7Ozs7Ozt3RkFhcUUsQ0FBQztnQkFDckYsTUFBTSxhQUFhLEdBQUcsQ0FBQzt3QkFDdEIsRUFBRSxFQUFFLFdBQVc7d0JBQ2YsS0FBSyxFQUFFLGdCQUFnQjt3QkFDdkIsR0FBRyxFQUFFLElBQUk7d0JBQ1QsT0FBTyxFQUFFLGdCQUFnQjt3QkFDekIsT0FBTyxFQUFFLElBQUk7cUJBQ2IsQ0FBQyxDQUFDO2dCQUNILEtBQUssQ0FBQyxHQUFHLEVBQUU7b0JBQ1YsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO29CQUNsRCxXQUFXLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7b0JBQ2xFLGFBQWEsQ0FBQywrQkFBK0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDeEQsQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsS0FBSyxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtvQkFDcEMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEtBQUssSUFBSSxFQUFFO3dCQUN4QyxXQUFXLENBQUMsQ0FBQyxNQUFNLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsYUFBYSxDQUFDLFdBQVcsRUFBRSxnQkFBZ0IsRUFBRSxtQkFBbUIsQ0FBQyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7b0JBQ3BNLENBQUMsQ0FBQyxDQUFDO2dCQUNKLENBQUMsQ0FBQyxDQUFDO2dCQUNILElBQUksQ0FBQyxpQkFBaUIsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDbEMsa0JBQWtCLENBQUMsQ0FBQyxNQUFNLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsYUFBYSxDQUFDLFdBQVcsRUFBRSxNQUFNLEVBQUUsbUJBQW1CLENBQUMsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxZQUFZLENBQUMsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDO2dCQUNyTSxDQUFDLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUVELEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7WUFDaEMsTUFBTSxXQUFXLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUM5QixNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUM7WUFDM0IsTUFBTSxNQUFNLEdBQUc7OzswQ0FHd0IsQ0FBQztZQUN4QyxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUM7WUFDckIsTUFBTSxPQUFPLEdBQUcsQ0FBQztvQkFDaEIsRUFBRSxFQUFFLHVCQUF1QjtvQkFDM0IsT0FBTyxFQUFFLElBQUk7b0JBQ2IsS0FBSyxFQUFFLDRDQUE0QztvQkFDbkQsT0FBTyxFQUFFLDRDQUE0QztvQkFDckQsT0FBTyxFQUFFLHVDQUF1QztpQkFDaEQsQ0FBQyxDQUFDO1lBQ0gsS0FBSyxDQUFDLEdBQUcsRUFBRTtnQkFDVixNQUFNLE9BQU8sR0FBRyxrQkFBa0IsRUFBRSxDQUFDO2dCQUNyQyxXQUFXLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7Z0JBQ2xFLGFBQWEsQ0FBQywrQkFBK0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN4RCxDQUFDLENBQUMsQ0FBQztZQUNILEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7Z0JBQ3BDLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDeEMsV0FBVyxDQUFDLENBQUMsTUFBTSx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLGFBQWEsQ0FBQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsa0JBQWtCLEVBQUUsUUFBUSxDQUFDLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDek0sQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxDQUFDLHdCQUF3QixFQUFFLEtBQUssSUFBSSxFQUFFO29CQUN6QyxXQUFXLENBQUMsQ0FBQyxNQUFNLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsYUFBYSxDQUFDLFlBQVksRUFBRSxNQUFNLEVBQUUsa0JBQWtCLEVBQUUsUUFBUSxDQUFDLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDcE0sQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztZQUNILEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7Z0JBQ2xDLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDMUMsa0JBQWtCLENBQUMsQ0FBQyxNQUFNLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsYUFBYSxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsa0JBQWtCLEVBQUUsUUFBUSxDQUFDLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDcE0sQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxDQUFDLHNCQUFzQixFQUFFLEtBQUssSUFBSSxFQUFFO29CQUN2QyxrQkFBa0IsQ0FBQyxDQUFDLE1BQU0sdUJBQXVCLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxhQUFhLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxrQkFBa0IsRUFBRSxDQUFDLENBQUMsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxZQUFZLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUM3TCxDQUFDLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFDSCxLQUFLLENBQUMsYUFBYSxFQUFFLEdBQUcsRUFBRTtZQUN6QixNQUFNLFdBQVcsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1lBQzlCLE1BQU0sT0FBTyxHQUFHLFVBQVUsQ0FBQztZQUMzQixNQUFNLE1BQU0sR0FBRzs7Ozs7OzswRUFPd0QsQ0FBQztZQUN4RSxNQUFNLFFBQVEsR0FBRyxDQUFDLENBQUM7WUFDbkIsTUFBTSxPQUFPLEdBQUcsQ0FBQztvQkFDaEIsRUFBRSxFQUFFLGVBQWU7b0JBQ25CLE9BQU8sRUFBRSxJQUFJO29CQUNiLEtBQUssRUFBRSw4REFBOEQ7b0JBQ3JFLE9BQU8sRUFBRSw4REFBOEQ7b0JBQ3ZFLEdBQUcsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLHdEQUF3RCxDQUFDO2lCQUN4RSxDQUFDLENBQUM7WUFDSCxLQUFLLENBQUMsR0FBRyxFQUFFO2dCQUNWLE1BQU0sT0FBTyxHQUFHLFdBQVcsRUFBRSxDQUFDO2dCQUM5QixXQUFXLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7Z0JBQ2xFLGFBQWEsQ0FBQywrQkFBK0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN4RCxDQUFDLENBQUMsQ0FBQztZQUNILEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7Z0JBQ3BDLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDeEMsV0FBVyxDQUFDLENBQUMsTUFBTSx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLGFBQWEsQ0FBQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsc0JBQXNCLEVBQUUsUUFBUSxDQUFDLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDN00sQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxDQUFDLHdCQUF3QixFQUFFLEtBQUssSUFBSSxFQUFFO29CQUN6QyxXQUFXLENBQUMsQ0FBQyxNQUFNLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsYUFBYSxDQUFDLFlBQVksRUFBRSxNQUFNLEVBQUUsc0JBQXNCLEVBQUUsUUFBUSxDQUFDLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDeE0sQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxDQUFDLHFCQUFxQixFQUFFLEtBQUssSUFBSSxFQUFFO29CQUN0QyxXQUFXLENBQUMsQ0FBQyxNQUFNLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsYUFBYSxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsc0JBQXNCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDNUwsQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztZQUNILEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7Z0JBQ2xDLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDMUMsa0JBQWtCLENBQUMsQ0FBQyxNQUFNLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsYUFBYSxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsc0JBQXNCLEVBQUUsUUFBUSxDQUFDLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDeE0sQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsOEJBQThCLEVBQUUsR0FBRyxFQUFFO1FBQzFDLE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFDOUIsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDO1FBQzNCLE1BQU0sTUFBTSxHQUFHOzs7eUNBR3dCLENBQUM7UUFDeEMsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDO1FBQ3JCLE1BQU0sT0FBTyxHQUFHLENBQUM7Z0JBQ2hCLEVBQUUsRUFBRSx1QkFBdUI7Z0JBQzNCLE9BQU8sRUFBRSxJQUFJO2dCQUNiLEtBQUssRUFBRSw0Q0FBNEM7Z0JBQ25ELE9BQU8sRUFBRSw0Q0FBNEM7Z0JBQ3JELE9BQU8sRUFBRSx1Q0FBdUM7YUFDaEQsQ0FBQyxDQUFDO1FBQ0gsS0FBSyxDQUFDLEdBQUcsRUFBRTtZQUNWLE1BQU0sV0FBVyxHQUFHLGtCQUFrQixFQUFFLENBQUM7WUFDekMsTUFBTSxTQUFTLEdBQUcsV0FBVyxFQUFFLENBQUM7WUFDaEMsYUFBYSxDQUFDLCtCQUErQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3pELFdBQVcsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsV0FBVyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDdEYsQ0FBQyxDQUFDLENBQUM7UUFDSCxLQUFLLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO1lBQ3BDLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDeEMsV0FBVyxDQUFDLENBQUMsTUFBTSx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLGFBQWEsQ0FBQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsa0JBQWtCLEVBQUUsUUFBUSxDQUFDLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN6TSxDQUFDLENBQUMsQ0FBQztZQUNILElBQUksQ0FBQyx3QkFBd0IsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDekMsV0FBVyxDQUFDLENBQUMsTUFBTSx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLGFBQWEsQ0FBQyxZQUFZLEVBQUUsTUFBTSxFQUFFLGtCQUFrQixFQUFFLFFBQVEsQ0FBQyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDcE0sQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUNILEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7WUFDbEMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUMxQyxrQkFBa0IsQ0FBQyxDQUFDLE1BQU0sdUJBQXVCLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxhQUFhLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxrQkFBa0IsRUFBRSxRQUFRLENBQUMsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxZQUFZLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3BNLENBQUMsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLHNCQUFzQixFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUN2QyxrQkFBa0IsQ0FBQyxDQUFDLE1BQU0sdUJBQXVCLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxhQUFhLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxrQkFBa0IsRUFBRSxDQUFDLENBQUMsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxZQUFZLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzdMLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUNILEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7UUFDckMsS0FBSyxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUU7WUFDckIsTUFBTSxXQUFXLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUM5QixNQUFNLE9BQU8sR0FBRyxlQUFlLENBQUM7WUFDaEMsTUFBTSxNQUFNLEdBQUc7Z0JBQ2QsS0FBSztnQkFDTCxFQUFFO2dCQUNGLHVCQUF1QjtnQkFDdkIsK0dBQStHO2dCQUMvRyxFQUFFO2dCQUNGLDZCQUE2QjtnQkFDN0IsMERBQTBEO2dCQUMxRCw0QkFBNEI7Z0JBQzVCLDJCQUEyQjtnQkFDM0IsbUNBQW1DO2dCQUNuQyxvRUFBb0U7Z0JBQ3BFLEVBQUU7YUFDRixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNiLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQztZQUNyQixNQUFNLE9BQU8sR0FBRztnQkFDZixTQUFTO2dCQUNULFVBQVU7Z0JBQ1YsT0FBTztnQkFDUCxXQUFXO2dCQUNYLE9BQU87Z0JBQ1AsTUFBTTtnQkFDTixPQUFPO2dCQUNQLE1BQU07Z0JBQ04sTUFBTTtnQkFDTixRQUFRO2FBQ1IsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ2YsT0FBTztvQkFDTixFQUFFLEVBQUUsb0JBQW9CO29CQUN4QixPQUFPLEVBQUUsSUFBSTtvQkFDYixLQUFLLEVBQUUsUUFBUSxPQUFPLEVBQUU7b0JBQ3hCLE9BQU8sRUFBRSxRQUFRLE9BQU8sRUFBRTtvQkFDMUIsT0FBTyxFQUFFLE9BQU87aUJBQ2hCLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztZQUNILEtBQUssQ0FBQyxHQUFHLEVBQUU7Z0JBQ1YsTUFBTSxXQUFXLEdBQUcsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDdkMsYUFBYSxDQUFDLCtCQUErQixDQUFDLFdBQVcsQ0FBQyxDQUFDO2dCQUMzRCxXQUFXLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7WUFDM0UsQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsOENBQThDLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQy9ELFdBQVcsQ0FBQyxDQUFDLE1BQU0sdUJBQXVCLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxhQUFhLENBQUMsT0FBTyxFQUFFLGdCQUFnQixFQUFFLDJCQUEyQixFQUFFLFFBQVEsQ0FBQyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDbE4sQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMscUNBQXFDLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3RELGtCQUFrQixDQUFDLENBQUMsTUFBTSx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLGFBQWEsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLDJCQUEyQixFQUFFLFFBQVEsQ0FBQyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDN00sQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUNILEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7WUFDaEMsTUFBTSxXQUFXLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUM5QixNQUFNLE9BQU8sR0FBRyxlQUFlLENBQUM7WUFDaEMsTUFBTSxNQUFNLEdBQUc7Z0JBQ2QsS0FBSztnQkFDTCxFQUFFO2dCQUNGLHNCQUFzQjtnQkFDdEIsK0dBQStHO2dCQUMvRyxFQUFFO2dCQUNGLDZCQUE2QjtnQkFDN0IsMERBQTBEO2dCQUMxRCw0QkFBNEI7Z0JBQzVCLDJCQUEyQjtnQkFDM0IsbUNBQW1DO2dCQUNuQyxvRUFBb0U7Z0JBQ3BFLEVBQUU7YUFDRixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNiLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQztZQUNyQixNQUFNLE9BQU8sR0FBRztnQkFDZiwwQkFBMEI7Z0JBQzFCLHlCQUF5QjtnQkFDekIsaUNBQWlDO2dCQUNqQyxTQUFTO2FBQ1QsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ2YsT0FBTztvQkFDTixFQUFFLEVBQUUsbUNBQW1DO29CQUN2QyxPQUFPLEVBQUUsSUFBSTtvQkFDYixLQUFLLEVBQUUsUUFBUSxPQUFPLEVBQUU7b0JBQ3hCLE9BQU8sRUFBRSxRQUFRLE9BQU8sRUFBRTtvQkFDMUIsT0FBTyxFQUFFLE9BQU87aUJBQ2hCLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztZQUNILEtBQUssQ0FBQyxHQUFHLEVBQUU7Z0JBQ1YsTUFBTSxXQUFXLEdBQUcsNEJBQTRCLEVBQUUsQ0FBQztnQkFDbkQsYUFBYSxDQUFDLCtCQUErQixDQUFDLFdBQVcsQ0FBQyxDQUFDO2dCQUMzRCxXQUFXLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7WUFDM0UsQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsOENBQThDLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQy9ELFdBQVcsQ0FBQyxDQUFDLE1BQU0sdUJBQXVCLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxhQUFhLENBQUMsT0FBTyxFQUFFLGdCQUFnQixFQUFFLHVDQUF1QyxFQUFFLFFBQVEsQ0FBQyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDOU4sQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMscUNBQXFDLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3RELGtCQUFrQixDQUFDLENBQUMsTUFBTSx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLGFBQWEsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLHVDQUF1QyxFQUFFLFFBQVEsQ0FBQyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDek4sQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUM7QUFFSCxTQUFTLGFBQWEsQ0FBQyxPQUFlLEVBQUUsTUFBYyxFQUFFLGFBQStCLEVBQUUsUUFBaUIsRUFBRSxXQUFzQjtJQUNqSSxPQUFPO1FBQ04sR0FBRyxFQUFFLEVBQUU7UUFDUCx1QkFBdUIsRUFBRSxFQUFFO1FBQzNCLGNBQWMsRUFBRSxFQUFFO1FBQ2xCLFNBQVMsRUFBRSxTQUFTO1FBQ3BCLE1BQU0sRUFBRSxTQUFTO1FBQ2pCLE9BQU87UUFDUCxTQUFTLEVBQUUsSUFBSTtRQUNmLFFBQVE7UUFDUixTQUFTLEVBQUUsR0FBRyxFQUFFLEdBQUcsT0FBTyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ25DLGNBQWMsRUFBRSxDQUFDLFFBQWdDLEVBQUUsRUFBRTtZQUNwRCxJQUFJLGFBQWEsRUFBRSxDQUFDO2dCQUNuQixNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxJQUFJLFNBQVMsQ0FBQztnQkFDNUQsSUFBSSxVQUFVLEVBQUUsQ0FBQztvQkFDaEIsT0FBTyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsRUFBRSxFQUFFLENBQUM7Z0JBQ3BGLENBQUM7WUFDRixDQUFDO1lBQ0QsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUNELFNBQVMsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFO1FBQ3JCLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTTtLQUNMLENBQUM7QUFDdkIsQ0FBQztBQUdELFNBQVMsa0JBQWtCLENBQUMsTUFBZ0MsRUFBRSxRQUFzQjtJQUNuRixXQUFXLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDN0MsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUMxQyxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakMsTUFBTSxVQUFVLEdBQVEsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xDLFdBQVcsQ0FBQyxVQUFVLENBQUMsRUFBRSxFQUFFLFlBQVksQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbEQsV0FBVyxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNqRSxXQUFXLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzNELFdBQVcsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDakUsSUFBSSxZQUFZLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDMUIsV0FBVyxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZELENBQUM7UUFDRCxJQUFJLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUN0QixXQUFXLENBQUMsVUFBVSxDQUFDLEdBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRSxZQUFZLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDdEUsQ0FBQztJQUNGLENBQUM7QUFDRixDQUFDIn0=