/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Terminal, SettingsEditor, TerminalCommandIdWithValue } from '../../../../automation';
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

		it('should show sticky scroll when appropriate', async () => {
			// Create the simplest system profile to get as little process interaction as possible
			await terminal.createEmptyTerminal();

			// Write prompt, fill viewport, finish command, print new prompt, verify sticky scroll
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.WriteDataToTerminal, [
				`${vsc('A')}Prompt> ${vsc('B')}sticky scroll 1`,
				`\\r\\n${vsc('C')}`,
				`\\r\\ndata`.repeat(50),
				`\\r\\n${vsc('D;0')}`, // Success
				`${vsc('A')}Prompt> ${vsc('B')}sticky scroll 2`
			].join(''));
			await app.code.waitForElements('.terminal-sticky-scroll', false, elements => elements.some(e => e.textContent.indexOf('Prompt> sticky scroll 1') >= 0));

			// And again with a failed command
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.WriteDataToTerminal, [
				`\\r\\n${vsc('C')}`,
				`\\r\\ndata`.repeat(50),
				`\\r\\n${vsc('D;1')}`, // Fail
				`${vsc('A')}Prompt> ${vsc('B')}`,
			].join(''));
			await app.code.waitForElements('.terminal-sticky-scroll', false, elements => elements.some(e => e.textContent.indexOf('Prompt> sticky scroll 2') >= 0));
		});
	});
}

function vsc(data: string) {
	return setTextParams(`633;${data}`);
}

function setTextParams(data: string) {
	return osc(`${data}\\x07`);
}

function osc(data: string) {
	return `\\x1b]${data}`;
}
