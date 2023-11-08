/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Terminal, SettingsEditor } from '../../../../automation';
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
				['terminal.integrated.enableStickyScroll', 'true']
			]);
		});

		after(async function () {
			await settingsEditor.clearUserSettings();
		});

		it('should inherit cwd when split and update the tab description - alt click', async () => {
			// There should not be a visible sticky scroll element initially
			await terminal.createTerminal();
			await app.code.waitForElements('.terminal-sticky-scroll', false, elements => elements.length === 0);

			// Running ls should show the sticky scroll element
			await terminal.runCommandInTerminal(`ls`);
			await app.code.waitForElements('.terminal-sticky-scroll', false, elements => elements.length === 1 && elements[0].textContent.indexOf('ls') >= 0);
		});
	});
}
