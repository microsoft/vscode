/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import { strictEqual } from 'assert';
import { getActiveDocument } from 'vs/base/browser/dom';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IContextKeyService, type IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { NullLogService } from 'vs/platform/log/common/log';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import type { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { ShellIntegrationAddon } from 'vs/platform/terminal/common/xterm/shellIntegrationAddon';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { parseCompletionsFromShell, SuggestAddon } from 'vs/workbench/contrib/terminalContrib/suggest/browser/terminalSuggestAddon';
import { TerminalSuggestCommandId } from 'vs/workbench/contrib/terminalContrib/suggest/common/terminal.suggest';
import type { ITerminalSuggestConfiguration } from 'vs/workbench/contrib/terminalContrib/suggest/common/terminalSuggestConfiguration';
import { workbenchInstantiationService, type TestTerminalConfigurationService } from 'vs/workbench/test/browser/workbenchTestServices';

import { events as macos_bash_echo_simple } from 'vs/workbench/contrib/terminalContrib/suggest/test/browser/recordings/macos_bash_echo_simple';
import { events as macos_bash_echo_multiline } from 'vs/workbench/contrib/terminalContrib/suggest/test/browser/recordings/macos_bash_echo_multiline';
import { events as windows11_pwsh_getcontent_delete_ghost } from 'vs/workbench/contrib/terminalContrib/suggest/test/browser/recordings/windows11_pwsh_getcontent_delete_ghost';
import { events as windows11_pwsh_getcontent_file } from 'vs/workbench/contrib/terminalContrib/suggest/test/browser/recordings/windows11_pwsh_getcontent_file';
import { events as windows11_pwsh_input_ls_complete_ls } from 'vs/workbench/contrib/terminalContrib/suggest/test/browser/recordings/windows11_pwsh_input_ls_complete_ls';
import { events as windows11_pwsh_namespace_completion } from 'vs/workbench/contrib/terminalContrib/suggest/test/browser/recordings/windows11_pwsh_namespace_completion';
import { events as windows11_pwsh_type_before_prompt } from 'vs/workbench/contrib/terminalContrib/suggest/test/browser/recordings/windows11_pwsh_type_before_prompt';
import { events as windows11_pwsh_writehost_multiline_nav_up } from 'vs/workbench/contrib/terminalContrib/suggest/test/browser/recordings/windows11_pwsh_writehost_multiline_nav_up';
import { events as windows11_pwsh_writehost_multiline } from 'vs/workbench/contrib/terminalContrib/suggest/test/browser/recordings/windows11_pwsh_writehost_multiline';
import { importAMDNodeModule } from 'vs/amdX';
import { testRawPwshCompletions } from 'vs/workbench/contrib/terminalContrib/suggest/test/browser/testRawPwshCompletions';
import { ITerminalConfigurationService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { timeout } from 'vs/base/common/async';

const recordedTestCases: { name: string; events: RecordedSessionEvent[] }[] = [
	{ name: 'macos_bash_echo_simple', events: macos_bash_echo_simple as any as RecordedSessionEvent[] },
	{ name: 'macos_bash_echo_multiline', events: macos_bash_echo_multiline as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_getcontent_delete_ghost', events: windows11_pwsh_getcontent_delete_ghost as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_getcontent_file', events: windows11_pwsh_getcontent_file as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_input_ls_complete_ls', events: windows11_pwsh_input_ls_complete_ls as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_namespace_completion', events: windows11_pwsh_namespace_completion as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_type_before_prompt', events: windows11_pwsh_type_before_prompt as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_writehost_multiline_nav_up', events: windows11_pwsh_writehost_multiline_nav_up as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_writehost_multiline', events: windows11_pwsh_writehost_multiline as any as RecordedSessionEvent[] }
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

	setup(async () => {
		const terminalConfig = {
			fontFamily: 'monospace',
			fontSize: 12,
			fontWeight: 'normal',
			letterSpacing: 0,
			lineHeight: 1,
			integrated: {
				suggest: {
					enabled: true,
					quickSuggestions: true,
					suggestOnTriggerCharacters: true,
					runOnEnter: 'never',
					builtinCompletions: {
						pwshCode: true,
						pwshGit: true
					}
				} satisfies ITerminalSuggestConfiguration
			}
		};
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({
				files: { autoSave: false },
				terminal: terminalConfig
			})
		}, store);
		const terminalConfigurationService = instantiationService.get(ITerminalConfigurationService) as TestTerminalConfigurationService;
		terminalConfigurationService.setConfig(terminalConfig as any);
		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		xterm = store.add(new TerminalCtor({ allowProposedApi: true }));
		const shellIntegrationAddon = store.add(new ShellIntegrationAddon('', true, undefined, new NullLogService));
		capabilities = shellIntegrationAddon.capabilities;
		suggestWidgetVisibleContextKey = TerminalContextKeys.suggestWidgetVisible.bindTo(instantiationService.get(IContextKeyService));
		suggestAddon = store.add(instantiationService.createInstance(SuggestAddon, new Set(parseCompletionsFromShell(testRawPwshCompletions)), shellIntegrationAddon.capabilities, suggestWidgetVisibleContextKey));

		const testContainer = document.createElement('div');
		getActiveDocument().body.append(testContainer);
		xterm.open(testContainer);
		suggestAddon.setPanel(testContainer);
		suggestAddon.setScreen(xterm.element!.querySelector('.xterm-screen')!);

		xterm.loadAddon(shellIntegrationAddon);
		xterm.loadAddon(suggestAddon);
	});

	for (const testCase of recordedTestCases) {
		test(testCase.name, async () => {
			const suggestDataEvents: string[] = [];
			store.add(suggestAddon.onAcceptedCompletion(e => suggestDataEvents.push(e)));
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
						// If the output contains the command start sequence, allow time for the prompt to get adjusted.
						if (event.data.includes('\x1b]633;B')) {
							await Promise.all([
								new Promise<void>(r => xterm.write(event.data, () => r())),
								new Promise<void>(r => {
									const commandDetection = capabilities.get(TerminalCapability.CommandDetection);
									if (commandDetection) {
										const d = commandDetection.onCommandStarted(() => {
											d.dispose();
											r();
										});
									}
								})
							]);
						} else {
							await new Promise<void>(r => xterm.write(event.data, () => r()));
						}
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
