/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Terminal, SettingsEditor } from '../../../../automation';
import { itSkipOnFail } from '../../utils';

export function setup() {
	describe('Terminal Input', () => {
		let terminal: Terminal;
		let settingsEditor: SettingsEditor;

		// Acquire automation API
		before(async function () {
			const app = this.app as Application;
			terminal = app.workbench.terminal;
			settingsEditor = app.workbench.settingsEditor;
		});

		describe('Auto replies', () => {
			async function writeTextForAutoReply(text: string): Promise<void> {
				// Put the matching word in quotes to avoid powershell coloring the first word and
				// on a new line to avoid cursor move/line switching sequences
				await terminal.runCommandInTerminal(`"\r${text}`, true);
			}

			itSkipOnFail('should automatically reply to default "Terminate batch job (Y/N)"', async () => { // TODO@daniel https://github.com/microsoft/vscode/issues/139076
				await terminal.createTerminal();
				await writeTextForAutoReply('Terminate batch job (Y/N)?');
				await terminal.waitForTerminalText(buffer => buffer.some(line => line.match(/\?.*Y/)));
			});

			it('should automatically reply to a custom entry', async () => {
				await settingsEditor.addUserSetting('terminal.integrated.autoReplies', '{ "foo": "bar" }');
				await terminal.createTerminal();
				await writeTextForAutoReply('foo');
				await terminal.waitForTerminalText(buffer => buffer.some(line => line.match(/foo.*bar/)));
			});
		});
	});
}
