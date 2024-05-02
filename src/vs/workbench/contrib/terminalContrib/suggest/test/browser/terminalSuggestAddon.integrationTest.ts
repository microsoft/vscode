/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns, local/code-amd-node-module
import { Terminal } from '@xterm/xterm';

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
import { SuggestAddon } from 'vs/workbench/contrib/terminalContrib/suggest/browser/terminalSuggestAddon';
import { TerminalSuggestCommandId } from 'vs/workbench/contrib/terminalContrib/suggest/common/terminal.suggest';
import type { ITerminalSuggestConfiguration } from 'vs/workbench/contrib/terminalContrib/suggest/common/terminalSuggestConfiguration';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

import { isWindows } from 'vs/base/common/platform';
import { events as windows11_pwsh_getcontent_file } from 'vs/workbench/contrib/terminalContrib/suggest/test/browser/recordings/windows11_pwsh_getcontent_file';
import { events as windows11_pwsh_input_ls_complete_ls } from 'vs/workbench/contrib/terminalContrib/suggest/test/browser/recordings/windows11_pwsh_input_ls_complete_ls';
import { events as windows11_pwsh_namespace_completion } from 'vs/workbench/contrib/terminalContrib/suggest/test/browser/recordings/windows11_pwsh_namespace_completion';

const recordedTestCases: { name: string; events: RecordedSessionEvent[] }[] = [
	{ name: 'windows11_pwsh_getcontent_file', events: windows11_pwsh_getcontent_file as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_input_ls_complete_ls', events: windows11_pwsh_input_ls_complete_ls as any as RecordedSessionEvent[] },
	{ name: 'windows11_pwsh_namespace_completion', events: windows11_pwsh_namespace_completion as any as RecordedSessionEvent[] }
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

// DEBT: It's not clear why this doesn't play nicely on Linux
(isWindows ? suite : suite.skip)('Terminal Contrib Suggest Recordings', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let xterm: Terminal;
	let capabilities: TerminalCapabilityStore;
	let suggestWidgetVisibleContextKey: IContextKey<boolean>;
	let suggestAddon: SuggestAddon;

	setup(() => {
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({
				files: { autoSave: false },
				terminal: {
					integrated: {
						suggest: {
							enabled: true,
							quickSuggestions: true,
							suggestOnTriggerCharacters: true,
						} satisfies ITerminalSuggestConfiguration
					}
				}
			})
		}, store);
		xterm = store.add(new Terminal({ allowProposedApi: true }));
		const shellIntegrationAddon = store.add(new ShellIntegrationAddon('', true, undefined, new NullLogService));
		capabilities = shellIntegrationAddon.capabilities;
		suggestWidgetVisibleContextKey = TerminalContextKeys.suggestWidgetVisible.bindTo(instantiationService.get(IContextKeyService));
		suggestAddon = store.add(instantiationService.createInstance(SuggestAddon, shellIntegrationAddon.capabilities, suggestWidgetVisibleContextKey));

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
				// console.log(
				// 	event.type,
				// 	event.type === 'command'
				// 		? event.id
				// 		: event.type === 'resize'
				// 			? `${event.cols}x${event.rows}`
				// 			: (event.data.length > 50 ? event.data.slice(0, 50) + '...' : event.data).replaceAll('\x1b', '\\x1b').replace(/(\n|\r).+$/, '...')
				// );
				switch (event.type) {
					case 'resize': {
						xterm.resize(event.cols, event.rows);
						break;
					}
					case 'output': {
						await new Promise<void>(r => xterm.write(event.data, () => r()));
						// HACK: On Windows if the output contains the command start sequence, allow time for the
						//       prompt to get adjusted. Eventually we should be able to remove this, but right now
						//       a pause is required.
						if (isWindows && event.data.includes('\x1b]633;B')) {
							const commandDetection = capabilities.get(TerminalCapability.CommandDetection);
							if (commandDetection) {
								await new Promise<void>(r => {
									const d = commandDetection.onCommandStarted(() => {
										d.dispose();
										r();
									});
								});
							}
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
							await new Promise<void>(r => {
								const d = promptInputModel.onDidChangeInput(() => {
									if (promptInputModel.getCombinedString() === event.data) {
										d.dispose();
										r();
									}
								});
							});
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
