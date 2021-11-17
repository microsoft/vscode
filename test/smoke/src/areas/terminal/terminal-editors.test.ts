/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ParsedArgs } from 'minimist';
import { Code, Terminal, TerminalCommandId, TerminalCommandIdWithValue } from '../../../../automation/out';
import { afterSuite, beforeSuite } from '../../utils';

const EDITOR_GROUP_SELECTOR = '.editor .split-view-view';
const TAB_SELECTOR = '.terminal-tab';
const PLUS_BUTTON_SELECTOR = 'li.action-item.monaco-dropdown-with-primary .codicon-plus';
const SPLIT_BUTTON_SELECTOR = '.editor .codicon-split-horizontal';

export function setup(opts: ParsedArgs) {
	describe.only('Terminal Editors', () => {
		let code: Code;
		let terminal: Terminal;


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
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.ChangeColor, color);
			await code.waitForElement(`${TAB_SELECTOR}.terminal-icon-terminal_ansi${color}`);
		});

		it('should update icon of the tab', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			const icon = 'symbol-method';
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.ChangeIcon, icon);
			await code.waitForElement(`${TAB_SELECTOR}.codicon-${icon}`);
		});

		it('should rename the tab', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			const name = 'my terminal name';
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.Rename, name);
			await code.waitForElement(TAB_SELECTOR, e => e ? e?.textContent === name : false);
		});

		it('should show the panel when the terminal is moved there', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			await terminal.runCommand(TerminalCommandId.MoveToPanel);
			await code.waitForElement('.single-terminal-tab');
		});

		it('should open a terminal in a new group for open to the side', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			await terminal.runCommand(TerminalCommandId.SplitEditor);
			await code.waitForElements(EDITOR_GROUP_SELECTOR, true, editorGroups => editorGroups && editorGroups.length === 2);
		});

		it('should open a terminal in a new group when the split button is pressed', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			await code.waitAndClick(SPLIT_BUTTON_SELECTOR);
			await code.waitForElements(EDITOR_GROUP_SELECTOR, true, editorGroups => editorGroups && editorGroups.length === 2);
		});

		it('should create new terminals in the active editor group via command', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			await code.waitForElements(EDITOR_GROUP_SELECTOR, true, editorGroups => editorGroups && editorGroups.length === 1);
		});

		it('should create new terminals in the active editor group via plus button', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			await code.waitAndClick(PLUS_BUTTON_SELECTOR);
			await code.waitForElements(EDITOR_GROUP_SELECTOR, true, editorGroups => editorGroups && editorGroups.length === 1);
		});
	});
}
