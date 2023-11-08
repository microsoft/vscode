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

			function generateCommandAndOutput(command: string, exitCode: number): string {
				return [
					`${vsc('A')}Prompt> ${vsc('B')}${command}`,
					`\\r\\n${vsc('C')}`,
					`\\r\\ndata`.repeat(50),
					`\\r\\n${vsc(`D;${exitCode}`)}`,
				].join('');
			}

			// A polling approach is used to avoid test flakiness. While it's not ideal that this
			// occurs, the main purpose of the tests is to verify sticky scroll shows and updates,
			// not edge case race conditions on terminal start up
			async function checkCommandAndOutput(command: string, exitCode: number): Promise<void> {
				const data = generateCommandAndOutput(command, exitCode);
				await terminal.runCommandWithValue(TerminalCommandIdWithValue.WriteDataToTerminal, data);
				const element = await app.code.getElement('.terminal-sticky-scroll .xterm-rows');
				if (element && element.textContent.indexOf(`Prompt> ${command}`) >= 0) {
					return;
				}
				throw new Error(`Failed for command ${command}, exitcode ${exitCode}, text content ${element?.textContent}`);
			}

			// Write prompt, fill viewport, finish command, print new prompt, verify sticky scroll
			await checkCommandAndOutput('sticky scroll 1', 0);

			// And again with a failed command
			await checkCommandAndOutput('sticky scroll 2', 1);
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
