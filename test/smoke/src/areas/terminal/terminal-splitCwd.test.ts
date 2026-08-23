/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Terminal, SettingsEditor } from '../../../../automation';
import { setTerminalTestSettings } from './terminal-helpers';

export function setup(options?: { skipSuite: boolean }) {
	(options?.skipSuite ? describe.skip : describe)('Terminal splitCwd', () => {
		// Acquire automation API
		let terminal: Terminal;
		let settingsEditor: SettingsEditor;
		before(async function () {
			const app = this.app as Application;
			terminal = app.workbench.terminal;
			settingsEditor = app.workbench.settingsEditor;
			await setTerminalTestSettings(app, [
				['terminal.integrated.splitCwd', '"inherited"']
			]);
		});

		after(async function () {
			await settingsEditor.clearUserSettings();
		});

		it('should inherit cwd when split and update the tab description - alt click', async () => {
			await terminal.createTerminal();
			const cwd = 'test';
			await terminal.runCommandInTerminal(`mkdir ${cwd}`);
			await terminal.runCommandInTerminal(`cd ${cwd}`);
			const page = await terminal.getPage();
			page.keyboard.down('Alt');
			await terminal.clickSingleTab();
			page.keyboard.up('Alt');
			await terminal.assertTerminalGroups([[{ description: cwd }, { description: cwd }]]);
		});
	});
}
