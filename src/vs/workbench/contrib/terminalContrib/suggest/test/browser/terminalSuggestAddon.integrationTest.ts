/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import { strictEqual } from 'assert';
import { getActiveDocument } from '../../../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService, type IContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import type { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { ShellIntegrationAddon } from '../../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js';
import { TerminalContextKeys } from '../../../../terminal/common/terminalContextKey.js';
import { SuggestAddon } from '../../browser/terminalSuggestAddon.js';
import { TerminalSuggestCommandId } from '../../common/terminal.suggest.js';
import type { ITerminalSuggestConfiguration } from '../../common/terminalSuggestConfiguration.js';
import { workbenchInstantiationService, type TestTerminalConfigurationService } from '../../../../../test/browser/workbenchTestServices.js';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ITerminalConfigurationService } from '../../../../terminal/browser/terminal.js';
import { timeout } from '../../../../../../base/common/async.js';
import { parseCompletionsFromShell, PwshCompletionProviderAddon } from '../../browser/pwshCompletionProviderAddon.js';
import { ITerminalCompletionService, TerminalCompletionService } from '../../browser/terminalCompletionService.js';
import { GeneralShellType } from '../../../../../../platform/terminal/common/terminal.js';
import { testRawPwshCompletions } from './testRawPwshCompletions.js';

import { events as windows11_pwsh_filename_arg_change_case } from './recordings/windows11_pwsh_filename_arg_change_case.js';
import { events as windows11_pwsh_filename_arg_same_case } from './recordings/windows11_pwsh_filename_arg_same_case.js';
import { events as windows11_pwsh_filename_change_case } from './recordings/windows11_pwsh_filename_change_case.js';
import { events as windows11_pwsh_filename_change_case_and_forward_slash } from './recordings/windows11_pwsh_filename_change_case_and_forward_slash.js';
import { events as windows11_pwsh_filename_same_case } from './recordings/windows11_pwsh_filename_same_case.js';
import { events as windows11_pwsh_filename_same_case_change_forward_slash } from './recordings/windows11_pwsh_filename_same_case_change_forward_slash.js';
import { events as windows11_pwsh_getcontent_delete_ghost } from './recordings/windows11_pwsh_getcontent_delete_ghost.js';
import { events as windows11_pwsh_input_ls_complete_ls } from './recordings/windows11_pwsh_input_ls_complete_ls.js';
import { events as windows11_pwsh_namespace_same_prefix } from './recordings/windows11_pwsh_namespace_same_prefix.js';
import { events as windows11_pwsh_type_before_prompt } from './recordings/windows11_pwsh_type_before_prompt.js';
import { events as windows11_pwsh_writehost_multiline } from './recordings/windows11_pwsh_writehost_multiline.js';
import { events as windows11_pwsh_writehost_multiline_nav_up } from './recordings/windows11_pwsh_writehost_multiline_nav_up.js';

// These are test cases recorded with the `Developer: Record Terminal Session` command. Once that is
// run, a terminal is created and the test case is manually executed. After nothing happens for a
// few seconds the test case will be put into the clipboard.
//
// Some things to be aware of when recording tests:
// - Pwsh on non-Windows can add a bunch of spammy cursor reports (`CSI x;y R`)
// - It's best to record pwsh on Windows
// - It's best to record other shells on non-Windows
// - Turn off builtinCompletions to simplify the recording
// - Capitalization matters in the recorded events
const recordedTestCases: { name: string; events: RecordedSessionEvent[] }[] = [
	{ name: 'windows11_pwsh_filename_arg_change_case', events: windows11_pwsh_filename_arg_change_case as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_filename_arg_same_case', events: windows11_pwsh_filename_arg_same_case as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_filename_change_case_and_forward_slash', events: windows11_pwsh_filename_change_case_and_forward_slash as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_filename_change_case', events: windows11_pwsh_filename_change_case as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_filename_same_case_change_forward_slash', events: windows11_pwsh_filename_same_case_change_forward_slash as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_filename_same_case', events: windows11_pwsh_filename_same_case as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_getcontent_delete_ghost', events: windows11_pwsh_getcontent_delete_ghost as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_input_ls_complete_ls', events: windows11_pwsh_input_ls_complete_ls as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_namespace_same_prefix', events: windows11_pwsh_namespace_same_prefix as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_type_before_prompt', events: windows11_pwsh_type_before_prompt as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_writehost_multiline_nav_up', events: windows11_pwsh_writehost_multiline_nav_up as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_writehost_multiline', events: windows11_pwsh_writehost_multiline as any as RecordedSessionEvent[] },
];

type RecordedSessionEvent = IRecordedSessionTerminalEvent | IRecordedSessionCommandEvent | IRecordedSessionResizeEvent;

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

suite('Terminal Contrib Suggest Recordings', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let xterm: Terminal;
	let capabilities: TerminalCapabilityStore;
	let suggestWidgetVisibleContextKey: IContextKey<boolean>;
	let suggestAddon: SuggestAddon;
	let pwshCompletionProvider: PwshCompletionProviderAddon;

	setup(async () => {
		const terminalConfig = {
			integrated: {
				suggest: {
					enabled: true,
					quickSuggestions: true,
					suggestOnTriggerCharacters: true,
					runOnEnter: 'never',
					builtinCompletions: {
						pwshCode: true,
						pwshGit: true
					},
					providers: {
						'terminal-suggest': true,
						'pwsh-shell-integration': true,
					},
				} satisfies ITerminalSuggestConfiguration
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
		terminalConfigurationService.setConfig(terminalConfig as any);
		const completionService = instantiationService.createInstance(TerminalCompletionService);
		instantiationService.stub(ITerminalCompletionService, store.add(completionService));
		const shellIntegrationAddon = store.add(new ShellIntegrationAddon('', true, undefined, new NullLogService));
		pwshCompletionProvider = store.add(instantiationService.createInstance(PwshCompletionProviderAddon, new Set(parseCompletionsFromShell(testRawPwshCompletions, -1, -1)), shellIntegrationAddon.capabilities));
		store.add(completionService.registerTerminalCompletionProvider('builtin-pwsh', PwshCompletionProviderAddon.ID, pwshCompletionProvider));
		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		xterm = store.add(new TerminalCtor({ allowProposedApi: true }));
		capabilities = shellIntegrationAddon.capabilities;
		suggestWidgetVisibleContextKey = TerminalContextKeys.suggestWidgetVisible.bindTo(instantiationService.get(IContextKeyService));
		suggestAddon = store.add(instantiationService.createInstance(SuggestAddon, GeneralShellType.PowerShell, shellIntegrationAddon.capabilities, suggestWidgetVisibleContextKey));
		const testContainer = document.createElement('div');
		getActiveDocument().body.append(testContainer);
		xterm.open(testContainer);
		suggestAddon.setContainerWithOverflow(testContainer);
		suggestAddon.setScreen(xterm.element!.querySelector('.xterm-screen')!);

		xterm.loadAddon(shellIntegrationAddon);
		xterm.loadAddon(pwshCompletionProvider);
		store.add(pwshCompletionProvider);
		xterm.loadAddon(suggestAddon);

		xterm.focus();
	});

	for (const testCase of recordedTestCases) {
		test(testCase.name, async () => {
			const suggestDataEvents: string[] = [];
			store.add(suggestAddon.onAcceptedCompletion(e => suggestDataEvents.push(e)));
			store.add(pwshCompletionProvider.onDidRequestSendText(e => suggestDataEvents.push(e)));
			for (const event of testCase.events) {
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
								const commandDetection = capabilities.get(TerminalCapability.CommandDetection);
								if (commandDetection) {
									const d = commandDetection.onCommandStarted(() => {
										d.dispose();
										r();
									});
								}
							}));
						} else if (event.data.match('\x1b\]633;Completions;.+\[.+\]')) {
							// If the output contains a pwsh completions sequence with results, wait for the associated
							// suggest addon event until proceeding.
							promises.push(new Promise<void>(r => {
								const d = suggestAddon.onDidReceiveCompletions(() => {
									d.dispose();
									r();
								});
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
					case 'sendText': {
						strictEqual(suggestDataEvents.at(-1), event.data);
						break;
					}
					case 'command': {
						switch (event.id) {
							case TerminalSuggestCommandId.AcceptSelectedSuggestion:
								suggestAddon.acceptSelectedSuggestion();
								break;
						}
					}
				}
			}
		});
	}
});
