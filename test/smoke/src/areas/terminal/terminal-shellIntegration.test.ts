/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Terminal, SettingsEditor } from '../../../../automation';

export function setup() {
	describe.only('Terminal Shell Integration', () => {
		let terminal: Terminal;
		let settingsEditor: SettingsEditor;
		let app: Application;
		// Acquire automation API
		before(async function () {
			app = this.app as Application;
			terminal = app.workbench.terminal;
			settingsEditor = app.workbench.settingsEditor;
		});

		describe('Shell integration', function () {
			it('should create a terminal', async () => {
				await settingsEditor.addUserSetting('terminal.integrated.shellIntegration.enabled', 'true');
				await terminal.createTerminal();
				await terminal.waitForTerminalText(buffer => buffer.some(e => e.includes('Shell integration activated')));
			});
		});
	});
}
