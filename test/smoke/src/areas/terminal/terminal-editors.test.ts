/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ParsedArgs } from 'minimist';
import { Terminal, TerminalCommandId, TerminalCommandIdWithValue } from '../../../../automation/out';
import { afterSuite, beforeSuite } from '../../utils';

export function setup(opts: ParsedArgs) {
	describe('Terminal Editors', () => {
		let terminal: Terminal;

		beforeSuite(opts);
		afterSuite(opts);

		before(function () {
			terminal = this.app.workbench.terminal;
		});

		afterEach(async () => {
			await terminal.runCommand(TerminalCommandId.KillAll);
		});

		it('should update color of the tab', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			const color = 'Cyan';
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.ChangeColor, color);
			await terminal.assertSingleTab({ color }, true);
		});

		it('should update icon of the tab', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			const icon = 'symbol-method';
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.ChangeIcon, icon);
			await terminal.assertSingleTab({ icon }, true);
		});

		it('should rename the tab', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			const name = 'my terminal name';
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.Rename, name);
			await terminal.assertSingleTab({ name }, true);
		});

		it('should show the panel when the terminal is moved there and close the editor', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			await terminal.runCommand(TerminalCommandId.MoveToPanel);
			await terminal.assertSingleTab({});
		});

		it('should open a terminal in a new group for open to the side', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			await terminal.runCommand(TerminalCommandId.SplitEditor);
			await terminal.assertEditorGroupCount(2);
		});

		it('should open a terminal in a new group when the split button is pressed', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			await terminal.clickSplitButton();
			await terminal.assertEditorGroupCount(2);
		});

		it('should create new terminals in the active editor group via command', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			await terminal.assertEditorGroupCount(1);
		});

		it('should create new terminals in the active editor group via plus button', async () => {
			await terminal.runCommand(TerminalCommandId.CreateNewEditor);
			await terminal.clickPlusButton();
			await terminal.assertEditorGroupCount(1);
		});
	});
}
