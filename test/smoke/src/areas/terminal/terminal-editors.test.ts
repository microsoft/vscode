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

		// TODO: Move into automation/terminal
		const enum TerminalCommandId {
			Rename = 'workbench.action.terminal.rename',
			ChangeColor = 'workbench.action.terminal.changeColor',
			ChangeIcon = 'workbench.action.terminal.changeIcon',
			KillAll = 'workbench.action.terminal.killAll',
			CreateNewEditor = 'workbench.action.createTerminalEditor',
			SplitEditor = 'workbench.action.createTerminalEditorSide',
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
	});
}
