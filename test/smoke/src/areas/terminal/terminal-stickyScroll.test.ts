/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Terminal, SettingsEditor, TerminalCommandIdWithValue } from '../../../../automation';
import { timeout } from '../../utils';
import { setTerminalTestSettings } from './terminal-helpers';

export function setup() {
	describe('Terminal stickyScroll', () => {
		// Acquire automation API
		let app: Application;
		let terminal: Terminal;
		let settingsEditor: SettingsEditor;
		before(async function () {
			app = this.app as Application;
			terminal = app.workbench.terminal;
			settingsEditor = app.workbench.settingsEditor;
			await setTerminalTestSettings(app, [
				['terminal.integrated.enableStickyScroll', 'true'],
				['terminal.integrated.shellIntegration.enabled', 'true']
			]);
		});

		after(async function () {
			await settingsEditor.clearUserSettings();
		});

		async function createShellIntegrationProfile() {
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.NewWithProfile, process.platform === 'win32' ? 'PowerShell' : 'bash');
		}

		it('should show sticky scroll when appropriate', async () => {
			// There should not be a visible sticky scroll element initially
			await createShellIntegrationProfile();
			await app.code.waitForElements('.terminal-sticky-scroll', false, elements => elements.length === 0);

			// Print a simple command in order to ensure shell integration sequences appear at the
			// correct place. This helps avoid a race condition if too much data floods into the
			// terminal before things are initialized.
			await terminal.runCommandInTerminal('echo "start up"');
			await terminal.waitForTerminalText(buffer => buffer.some(line => line.startsWith('start up')));

			// Allow to settle, again to avoid race conditions (with conpty)
			await timeout(500);

			// Running ls should show the sticky scroll element
			await terminal.runCommandInTerminal(process.platform === 'win32' ? `ls` : `ls -la`);
			await app.code.waitForElements('.terminal-sticky-scroll', false, elements => elements.length === 1 && elements[0].textContent.indexOf('ls') >= 0);
		});
	});
}
