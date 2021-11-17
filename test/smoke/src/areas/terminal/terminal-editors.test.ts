/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ParsedArgs } from 'minimist';
import { Code, Terminal } from '../../../../automation/out';
import { afterSuite, beforeSuite } from '../../utils';

export function setup(opts: ParsedArgs) {
	describe.only('Terminal Editors', () => {
		let code: Code;
		let terminal: Terminal;
		const editorGroupSelector = '.editor > div.content > div.grid-view-container > div > div > div > div.monaco-scrollable-element > div.split-view-container';
		// TODO: Move into automation/terminal
		const enum TerminalCommandId {
			Rename = 'workbench.action.terminal.rename',
			ChangeColor = 'workbench.action.terminal.changeColor',
			ChangeIcon = 'workbench.action.terminal.changeIcon',
			KillAll = 'workbench.action.terminal.killAll',
			CreateNewEditor = 'workbench.action.createTerminalEditor',
			SplitEditor = 'workbench.action.createTerminalEditorSide',
			Split = 'workbench.action.terminal.split',
			MoveToPanel = 'workbench.action.terminal.moveToTerminalPanel'
		}

		const tabSelector = '.terminal-tab';

		beforeSuite(opts);
		afterSuite(opts);

		before(function () {
			code = this.app.code;
			terminal = this.app.workbench.terminal;
		});

		afterEach(async () => {
			await terminal.runCommand(TerminalCommandId.KillAll);
		});

		it('should update color of the tab', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			const color = 'Cyan';
			await terminal.runCommand(TerminalCommandId.ChangeColor, color);
			await code.waitForElement(`${tabSelector}.terminal-icon-terminal_ansi${color}`);
		});

		it('should update icon of the tab', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			const icon = 'symbol-method';
			await terminal.runCommand(TerminalCommandId.ChangeIcon, icon);
			await code.waitForElement(`${tabSelector}.codicon-${icon}`);
		});

		it('should rename the tab', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			const name = 'my terminal name';
			await terminal.runCommand(TerminalCommandId.Rename, name);
			await code.waitForElement(tabSelector, e => e ? e?.textContent === name : false);
		});

		it('should show the panel when the terminal is moved there', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			await terminal.runCommand(TerminalCommandId.MoveToPanel);
			await code.waitForElement('.single-terminal-tab');
		});

		it('should open a terminal in a new group for open to the side', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			await terminal.runCommand(TerminalCommandId.SplitEditor);
			await code.waitForElements(editorGroupSelector, true, e => e && e.length > 0 ? e[0].children.length === 2 : false);
		});

		it.skip('should open a terminal in a new group when the split button is pressed', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			//TODO: split button
			// await terminal.runCommand(TerminalCommandId.SplitEditor);
			await code.waitForElements(editorGroupSelector, true, e => e && e.length > 0 ? e[0].children.length === 2 : false);
		});

		it('should open a terminal in the active editor group', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			await terminal.runCommand(TerminalCommandId.MoveToPanel);
			await code.waitForElements(editorGroupSelector, true, e => e && e.length > 0 ? e[0].children.length === 1 : false);
		});
	});
}
