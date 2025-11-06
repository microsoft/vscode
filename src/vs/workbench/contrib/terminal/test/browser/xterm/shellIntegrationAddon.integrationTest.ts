/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import { deepStrictEqual, fail, strictEqual } from 'assert';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { getActiveDocument } from '../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TerminalCapability, type ICommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import type { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { ShellIntegrationAddon } from '../../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js';
import { workbenchInstantiationService, type TestTerminalConfigurationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ITerminalConfigurationService } from '../../../../terminal/browser/terminal.js';

import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { events as rich_windows11_pwsh7_echo_3_times } from './recordings/rich/windows11_pwsh7_echo_3_times.js';
import { events as rich_windows11_pwsh7_ls_one_time } from './recordings/rich/windows11_pwsh7_ls_one_time.js';
import { events as rich_windows11_pwsh7_type_foo } from './recordings/rich/windows11_pwsh7_type_foo.js';
import { events as rich_windows11_pwsh7_type_foo_left_twice } from './recordings/rich/windows11_pwsh7_type_foo_left_twice.js';
import { events as rich_macos_zsh_omz_echo_3_times } from './recordings/rich/macos_zsh_omz_echo_3_times.js';
import { events as rich_macos_zsh_omz_ls_one_time } from './recordings/rich/macos_zsh_omz_ls_one_time.js';
import { events as basic_macos_zsh_p10k_ls_one_time } from './recordings/basic/macos_zsh_p10k_ls_one_time.js';
import type { ITerminalConfiguration } from '../../../common/terminal.js';

// These are test cases recorded with the `Developer: Record Terminal Session` command. Once that is
// run, a terminal is created and the test case is manually executed. After nothing happens for a
// few seconds the test case will be put into the clipboard.
//
// They aim to guarantee the complex interactions within command detection result in a particular
// outcome.
//
// Some things to be aware of when recording tests:
// - Pwsh on non-Windows can add a bunch of spammy cursor reports (`CSI x;y R`)
// - It's best to record pwsh on Windows
// - It's best to record other shells on non-Windows
// - Turn off builtinCompletions to simplify the recording
// - Capitalization matters in the recorded events
type RecordedTestCase = {
	/**
	 * The test case name.
	 */
	name: string;
	/**
	 * A set of events that will play or be awaited for in order.
	 */
	events: RecordedSessionEvent[];
	/**
	 * Any assertions to perform after the events have been played and validated.
	 */
	finalAssertions: (commandDetection: ICommandDetectionCapability | undefined) => void;
};
const recordedTestCases: RecordedTestCase[] = [
	{
		name: 'rich_windows11_pwsh7_echo_3_times',
		events: rich_windows11_pwsh7_echo_3_times as unknown as RecordedSessionEvent[],
		finalAssertions: (commandDetection: ICommandDetectionCapability | undefined) => {
			assertCommandDetectionState(commandDetection, ['echo a', 'echo b', 'echo c'], '|');
		}
	},
	{
		name: 'rich_windows11_pwsh7_ls_one_time',
		events: rich_windows11_pwsh7_ls_one_time as unknown as RecordedSessionEvent[],
		finalAssertions: (commandDetection: ICommandDetectionCapability | undefined) => {
			assertCommandDetectionState(commandDetection, ['ls'], '|');
		}
	},
	{
		name: 'rich_windows11_pwsh7_type_foo',
		events: rich_windows11_pwsh7_type_foo as unknown as RecordedSessionEvent[],
		finalAssertions: (commandDetection: ICommandDetectionCapability | undefined) => {
			assertCommandDetectionState(commandDetection, [], 'foo|');
		}
	},
	{
		name: 'rich_windows11_pwsh7_type_foo_left_twice',
		events: rich_windows11_pwsh7_type_foo_left_twice as unknown as RecordedSessionEvent[],
		finalAssertions: (commandDetection: ICommandDetectionCapability | undefined) => {
			assertCommandDetectionState(commandDetection, [], 'f|oo');
		}
	},
	{
		name: 'rich_macos_zsh_omz_echo_3_times',
		events: rich_macos_zsh_omz_echo_3_times as unknown as RecordedSessionEvent[],
		finalAssertions: (commandDetection: ICommandDetectionCapability | undefined) => {
			assertCommandDetectionState(commandDetection, ['echo a', 'echo b', 'echo c'], '|');
		}
	},
	{
		name: 'rich_macos_zsh_omz_ls_one_time',
		events: rich_macos_zsh_omz_ls_one_time as unknown as RecordedSessionEvent[],
		finalAssertions: (commandDetection: ICommandDetectionCapability | undefined) => {
			assertCommandDetectionState(commandDetection, ['ls'], '|');
		}
	},
	{
		name: 'basic_macos_zsh_p10k_ls_one_time',
		events: basic_macos_zsh_p10k_ls_one_time as unknown as RecordedSessionEvent[],
		finalAssertions: (commandDetection: ICommandDetectionCapability | undefined) => {
			// Prompt input model doesn't work for p10k yet
			// Assert a single command has completed
			deepStrictEqual(commandDetection!.commands.map(e => e.command), ['']);
		}
	},
];
function assertCommandDetectionState(commandDetection: ICommandDetectionCapability | undefined, commands: string[], promptInput: string) {
	if (!commandDetection) {
		fail('Command detection must be set');
	}
	deepStrictEqual(commandDetection!.commands.map(e => e.command), commands);
	strictEqual(commandDetection!.promptInputModel.getCombinedString(), promptInput);
}

type RecordedSessionEvent = (
	IRecordedSessionTerminalEvent |
	IRecordedSessionCommandEvent |
	IRecordedSessionResizeEvent
);

interface IRecordedSessionTerminalEvent {
	type: 'output' | 'input' | 'sendText' | 'promptInputChange';
	data: string;
}

interface IRecordedSessionCommandEvent {
	type: 'command';
	id: string;
}

interface IRecordedSessionResizeEvent {
	type: 'resize';
	cols: number;
	rows: number;
}

suite('Terminal Contrib Shell Integration Recordings', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let xterm: Terminal;
	let capabilities: TerminalCapabilityStore;

	setup(async () => {
		const terminalConfig = {
			integrated: {
			}
		};
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({
				files: { autoSave: false },
				terminal: terminalConfig,
				editor: { fontSize: 14, fontFamily: 'Arial', lineHeight: 12, fontWeight: 'bold' }
			})
		}, store);
		const terminalConfigurationService = instantiationService.get(ITerminalConfigurationService) as TestTerminalConfigurationService;
		terminalConfigurationService.setConfig(terminalConfig as unknown as Partial<ITerminalConfiguration>);
		const shellIntegrationAddon = store.add(new ShellIntegrationAddon('', true, undefined, NullTelemetryService, new NullLogService));
		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		xterm = store.add(new TerminalCtor({ allowProposedApi: true }));
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
						const promises: Promise<unknown>[] = [];
						if (event.data.includes('\x1b]633;B')) {
							// If the output contains the command start sequence, allow time for the prompt to get
							// adjusted.
							promises.push(new Promise<void>(r => {
								const commandDetection = capabilities.get(TerminalCapability.CommandDetection)!;
								if (commandDetection) {
									const d = commandDetection.onCommandStarted(() => {
										d.dispose();
										r();
									});
								}
							}));
						}
						promises.push(new Promise<void>(r => xterm.write(event.data, () => r())));
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
						const promptInputModel = capabilities.get(TerminalCapability.CommandDetection)?.promptInputModel;
						if (promptInputModel && promptInputModel.getCombinedString() !== event.data) {
							await Promise.race([
								await timeout(1000).then(() => { throw new Error(`Prompt input change timed out current="${promptInputModel.getCombinedString()}", expected="${event.data}"`); }),
								await new Promise<void>(r => {
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
			testCase.finalAssertions(capabilities.get(TerminalCapability.CommandDetection));
		});
	}
});
