/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, fail, strictEqual } from 'assert';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { getActiveDocument } from '../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ShellIntegrationAddon } from '../../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ITerminalConfigurationService } from '../../../../terminal/browser/terminal.js';
import { TestXtermLogger } from '../../../../../../platform/terminal/test/common/terminalTestHelpers.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { events as rich_windows11_pwsh7_echo_3_times } from './recordings/rich/windows11_pwsh7_echo_3_times.js';
import { events as rich_windows11_pwsh7_ls_one_time } from './recordings/rich/windows11_pwsh7_ls_one_time.js';
import { events as rich_windows11_pwsh7_type_foo } from './recordings/rich/windows11_pwsh7_type_foo.js';
import { events as rich_windows11_pwsh7_type_foo_left_twice } from './recordings/rich/windows11_pwsh7_type_foo_left_twice.js';
import { events as rich_macos_zsh_omz_echo_3_times } from './recordings/rich/macos_zsh_omz_echo_3_times.js';
import { events as rich_macos_zsh_omz_ls_one_time } from './recordings/rich/macos_zsh_omz_ls_one_time.js';
import { events as basic_macos_zsh_p10k_ls_one_time } from './recordings/basic/macos_zsh_p10k_ls_one_time.js';
const recordedTestCases = [
    {
        name: 'rich_windows11_pwsh7_echo_3_times',
        events: rich_windows11_pwsh7_echo_3_times,
        finalAssertions: (commandDetection) => {
            assertCommandDetectionState(commandDetection, ['echo a', 'echo b', 'echo c'], '|');
        }
    },
    {
        name: 'rich_windows11_pwsh7_ls_one_time',
        events: rich_windows11_pwsh7_ls_one_time,
        finalAssertions: (commandDetection) => {
            assertCommandDetectionState(commandDetection, ['ls'], '|');
        }
    },
    {
        name: 'rich_windows11_pwsh7_type_foo',
        events: rich_windows11_pwsh7_type_foo,
        finalAssertions: (commandDetection) => {
            assertCommandDetectionState(commandDetection, [], 'foo|');
        }
    },
    {
        name: 'rich_windows11_pwsh7_type_foo_left_twice',
        events: rich_windows11_pwsh7_type_foo_left_twice,
        finalAssertions: (commandDetection) => {
            assertCommandDetectionState(commandDetection, [], 'f|oo');
        }
    },
    {
        name: 'rich_macos_zsh_omz_echo_3_times',
        events: rich_macos_zsh_omz_echo_3_times,
        finalAssertions: (commandDetection) => {
            assertCommandDetectionState(commandDetection, ['echo a', 'echo b', 'echo c'], '|');
        }
    },
    {
        name: 'rich_macos_zsh_omz_ls_one_time',
        events: rich_macos_zsh_omz_ls_one_time,
        finalAssertions: (commandDetection) => {
            assertCommandDetectionState(commandDetection, ['ls'], '|');
        }
    },
    {
        name: 'basic_macos_zsh_p10k_ls_one_time',
        events: basic_macos_zsh_p10k_ls_one_time,
        finalAssertions: (commandDetection) => {
            // Prompt input model doesn't work for p10k yet
            // Assert a single command has completed
            deepStrictEqual(commandDetection.commands.map(e => e.command), ['']);
        }
    },
];
function assertCommandDetectionState(commandDetection, commands, promptInput) {
    if (!commandDetection) {
        fail('Command detection must be set');
    }
    deepStrictEqual(commandDetection.commands.map(e => e.command), commands);
    strictEqual(commandDetection.promptInputModel.getCombinedString(), promptInput);
}
suite('Terminal Contrib Shell Integration Recordings', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let xterm;
    let capabilities;
    setup(async () => {
        const terminalConfig = {
            integrated: {}
        };
        const instantiationService = workbenchInstantiationService({
            configurationService: () => new TestConfigurationService({
                files: { autoSave: false },
                terminal: terminalConfig,
                editor: { fontSize: 14, fontFamily: 'Arial', lineHeight: 12, fontWeight: 'bold' }
            })
        }, store);
        const terminalConfigurationService = instantiationService.get(ITerminalConfigurationService);
        terminalConfigurationService.setConfig(terminalConfig);
        const shellIntegrationAddon = store.add(new ShellIntegrationAddon('', true, undefined, NullTelemetryService, new NullLogService));
        const TerminalCtor = (await importAMDNodeModule('@xterm/xterm', 'lib/xterm.js')).Terminal;
        xterm = store.add(new TerminalCtor({ allowProposedApi: true, logger: TestXtermLogger }));
        capabilities = shellIntegrationAddon.capabilities;
        const testContainer = document.createElement('div');
        getActiveDocument().body.append(testContainer);
        xterm.open(testContainer);
        xterm.loadAddon(shellIntegrationAddon);
        xterm.focus();
    });
    for (const testCase of recordedTestCases) {
        test(testCase.name, async () => {
            for (const [i, event] of testCase.events.entries()) {
                // DEBUG: Uncomment to see the events as they are played
                // console.log(
                // 	event.type,
                // 	event.type === 'command'
                // 		? event.id
                // 		: event.type === 'resize'
                // 			? `${event.cols}x${event.rows}`
                // 			: (event.data.length > 50 ? event.data.slice(0, 50) + '...' : event.data).replaceAll('\x1b', '\\x1b').replace(/(\n|\r).+$/, '...')
                // );
                // console.log('promptInputModel', capabilities.get(TerminalCapability.CommandDetection)?.promptInputModel.getCombinedString());
                switch (event.type) {
                    case 'resize': {
                        xterm.resize(event.cols, event.rows);
                        break;
                    }
                    case 'output': {
                        const promises = [];
                        if (event.data.includes('\x1b]633;B')) {
                            // If the output contains the command start sequence, allow time for the prompt to get
                            // adjusted.
                            promises.push(new Promise(r => {
                                const commandDetection = capabilities.get(2 /* TerminalCapability.CommandDetection */);
                                if (commandDetection) {
                                    const d = commandDetection.onCommandStarted(() => {
                                        d.dispose();
                                        r();
                                    });
                                }
                            }));
                        }
                        promises.push(new Promise(r => xterm.write(event.data, () => r())));
                        await Promise.all(promises);
                        break;
                    }
                    case 'input': {
                        xterm.input(event.data, true);
                        break;
                    }
                    case 'promptInputChange': {
                        // Ignore this event if it's followed by another promptInputChange as that
                        // means this one isn't important and could cause a race condition in the
                        // test
                        if (testCase.events.length > i + 1 && testCase.events[i + 1].type === 'promptInputChange') {
                            continue;
                        }
                        const promptInputModel = capabilities.get(2 /* TerminalCapability.CommandDetection */)?.promptInputModel;
                        if (promptInputModel && promptInputModel.getCombinedString() !== event.data) {
                            await Promise.race([
                                await timeout(1000).then(() => { throw new Error(`Prompt input change timed out current="${promptInputModel.getCombinedString()}", expected="${event.data}"`); }),
                                await new Promise(r => {
                                    const d = promptInputModel.onDidChangeInput(() => {
                                        if (promptInputModel.getCombinedString() === event.data) {
                                            d.dispose();
                                            r();
                                        }
                                    });
                                })
                            ]);
                        }
                        break;
                    }
                }
            }
            testCase.finalAssertions(capabilities.get(2 /* TerminalCapability.CommandDetection */));
        });
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hlbGxJbnRlZ3JhdGlvbkFkZG9uLmludGVncmF0aW9uVGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlc3QvYnJvd3Nlci94dGVybS9zaGVsbEludGVncmF0aW9uQWRkb24uaW50ZWdyYXRpb25UZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxlQUFlLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUM1RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDNUgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRzlFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDJFQUEyRSxDQUFDO0FBQ2xILE9BQU8sRUFBRSw2QkFBNkIsRUFBeUMsTUFBTSxzREFBc0QsQ0FBQztBQUM1SSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN6RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFFekcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDckcsT0FBTyxFQUFFLE1BQU0sSUFBSSxpQ0FBaUMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2hILE9BQU8sRUFBRSxNQUFNLElBQUksZ0NBQWdDLEVB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