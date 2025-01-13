/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Terminal, SettingsEditor } from '../../../../automation';
import { setTerminalTestSettings } from './terminal-helpers';

export function setup(options?: { skipSuite: boolean }) {
	(options?.skipSuite ? describe.skip : describe)('Terminal Input', () => {
		let terminal: Terminal;
		let settingsEditor: SettingsEditor;

		// Acquire automation API
		before(async function () {
			const app = this.app as Application;
			terminal = app.workbench.terminal;
			settingsEditor = app.workbench.settingsEditor;
			await setTerminalTestSettings(app);
		});

		after(async function () {
			await settingsEditor.clearUserSettings();
		});

		describe('Auto replies', function () {

			// HACK: Retry this suite only on Windows because conpty can rarely lead to unexpected behavior which would
			// cause flakiness. If this does happen, the feature is expected to fail.
			if (process.platform === 'win32') {
				this.retries(3);
			}

			async function writeTextForAutoReply(text: string): Promise<void> {
				// Put the matching word in quotes to avoid powershell coloring the first word and
				// on a new line to avoid cursor move/line switching sequences
				await terminal.runCommandInTerminal(`"\r${text}`, true);
			}

			it('should automatically reply to a custom entry', async () => {
				await settingsEditor.addUserSetting('terminal.integrated.autoReplies', '{ "foo": "bar" }');
				await terminal.createTerminal();
				await writeTextForAutoReply('foo');
				await terminal.waitForTerminalText(buffer => buffer.some(line => line.match(/foo.*bar/)));
			});
		});
	});
}
