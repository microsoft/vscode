/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Terminal, SettingsEditor, TerminalCommandIdWithValue } from '../../../../automation';
import { setTerminalTestSettings } from './terminal-helpers';

export function setup(options?: { skipSuite: boolean }) {
	(options?.skipSuite ? describe.skip : describe)('Terminal stickyScroll', () => {
		// Acquire automation API
		let app: Application;
		let terminal: Terminal;
		let settingsEditor: SettingsEditor;
		before(async function () {
			app = this.app as Application;
			terminal = app.workbench.terminal;
			settingsEditor = app.workbench.settingsEditor;
			await setTerminalTestSettings(app, [
				['terminal.integrated.stickyScroll.enabled', 'true']
			]);
		});

		after(async function () {
			await settingsEditor.clearUserSettings();
		});

		// A polling approach is used to avoid test flakiness. While it's not ideal that this
		// occurs, the main purpose of the tests is to verify sticky scroll shows and updates,
		// not edge case race conditions on terminal start up
		async function checkCommandAndOutput(
			command: string,
			exitCode: number,
			prompt: string = 'Prompt> ',
			expectedLineCount: number = 1
		): Promise<void> {
			const data = generateCommandAndOutput(prompt, command, exitCode);
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.WriteDataToTerminal, data);
			// Verify line count
			await app.code.waitForElements('.terminal-sticky-scroll .xterm-rows > *', true, e => e.length === expectedLineCount);
			// Verify content
			const element = await app.code.getElement('.terminal-sticky-scroll .xterm-rows');
			if (
				element &&
				// New lines don't come through in textContent
				element.textContent.indexOf(`${prompt.replace(/\\r\\n/g, '')}${command}`) >= 0
			) {
				return;
			}
			throw new Error(`Failed for command ${command}, exitcode ${exitCode}, text content ${element?.textContent}`);
		}

		beforeEach(async () => {
			// Create the simplest system profile to get as little process interaction as possible
			await terminal.createEmptyTerminal();
		});

		it('should show sticky scroll when appropriate', async () => {
			// Write prompt, fill viewport, finish command, print new prompt, verify sticky scroll
			await checkCommandAndOutput('sticky scroll 1', 0);

			// And again with a failed command
			await checkCommandAndOutput('sticky scroll 2', 1);
		});

		it('should support multi-line prompt', async () => {
			// Standard multi-line prompt
			await checkCommandAndOutput('sticky scroll 1', 0, "Multi-line\\r\\nPrompt> ", 2);

			// New line before prompt
			await checkCommandAndOutput('sticky scroll 2', 0, "\\r\\nMulti-line Prompt> ", 1);

			// New line before multi-line prompt
			await checkCommandAndOutput('sticky scroll 3', 0, "\\r\\nMulti-line\\r\\nPrompt> ", 2);
		});
	});
}

function generateCommandAndOutput(prompt: string, command: string, exitCode: number): string {
	return [
		`${vsc('A')}${prompt}${vsc('B')}${command}`,
		`\\r\\n${vsc('C')}`,
		`\\r\\ndata`.repeat(50),
		`\\r\\n${vsc(`D;${exitCode}`)}`,
	].join('');
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
