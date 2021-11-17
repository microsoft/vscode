/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok } from 'assert';
import { ParsedArgs } from 'minimist';
import { Code, Terminal } from '../../../../automation/out';
import { afterSuite, beforeSuite } from '../../utils';

export function setup(opts: ParsedArgs) {
	// TODO: Re-enable when stable
	describe.skip('Terminal Tabs', () => {
		let code: Code;
		let terminal: Terminal;

		// TODO: Move into automation/terminal
		const enum TerminalCommandId {
			Rename = 'workbench.action.terminal.rename',
			ChangeColor = 'workbench.action.terminal.changeColor',
			ChangeIcon = 'workbench.action.terminal.changeIcon',
			Split = 'workbench.action.terminal.split',
			KillAll = 'workbench.action.terminal.killAll',
			Unsplit = 'workbench.action.terminal.unsplit',
			Join = 'workbench.action.terminal.join',
			Show = 'workbench.action.terminal.toggleTerminal',
			CreateNew = 'workbench.action.terminal.new'
		}

		beforeSuite(opts);
		afterSuite(opts);

		before(function () {
			code = this.app.code;
			terminal = this.app.workbench.terminal;
		});

		afterEach(async () => {
			await terminal.runCommand(TerminalCommandId.KillAll);
		});

		it('clicking the plus button should create a terminal and display the tabs view showing no split decorations', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await code.waitAndClick('li.action-item.monaco-dropdown-with-primary > div.action-container.menu-entry > a');
			const tabLabels = await terminal.getTabLabels(2);
			ok(!tabLabels[0].startsWith('┌') && !tabLabels[1].startsWith('└'));
		});

		it('should update color of the single tab', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			const color = 'Cyan';
			await terminal.runCommand(TerminalCommandId.ChangeColor, color);
			const singleTab = await code.waitForElement('.single-terminal-tab');
			ok(singleTab.className.includes(`terminal-icon-terminal_ansi${color}`));
		});

		it('should update color of the tab in the tabs list', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runCommand(TerminalCommandId.Split);
			const tabs = await terminal.getTabLabels(2);
			ok(tabs[0].startsWith('┌'));
			ok(tabs[1].startsWith('└'));
			const color = 'Cyan';
			await terminal.runCommand(TerminalCommandId.ChangeColor, color);
			await code.waitForElement(`.terminal-tabs-entry .terminal-icon-terminal_ansi${color}`);
		});

		it('should update icon of the single tab', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			const icon = 'symbol-method';
			await terminal.runCommand(TerminalCommandId.ChangeIcon, icon);
			await code.waitForElement(`.single-terminal-tab .codicon-${icon}`);
		});

		it('should update icon of the tab in the tabs list', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runCommand(TerminalCommandId.Split);
			const tabs = await terminal.getTabLabels(2);
			ok(tabs[0].startsWith('┌'));
			ok(tabs[1].startsWith('└'));
			const icon = 'symbol-method';
			await terminal.runCommand(TerminalCommandId.ChangeIcon, icon);
			await code.waitForElement(`.terminal-tabs-entry .codicon-${icon}`);
		});

		it('should rename the single tab', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			const name = 'my terminal name';
			await terminal.runCommand(TerminalCommandId.Rename, name);
			await code.waitForElement('.single-terminal-tab', e => e ? e?.textContent.includes(name) : false);
		});

		it('should rename the tab in the tabs list', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runCommand(TerminalCommandId.Split);
			const name = 'my terminal name';
			await terminal.runCommand(TerminalCommandId.Rename, name);
			await terminal.getTabLabels(2, true, t => t.some(element => element.textContent.includes(name)));
		});

		it('should create a split terminal when single tab is alt clicked', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			const page = await terminal.getPage();
			page.keyboard.down('Alt');
			await code.waitAndClick('.single-terminal-tab');
			page.keyboard.up('Alt');
			await terminal.getTabLabels(2, true);
		});

		it('should do nothing when join tabs is run with only one terminal', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runCommand(TerminalCommandId.Join);
			await code.waitForElement('.single-terminal-tab');
		});

		it('should join tabs when more than one terminal', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runCommand(TerminalCommandId.CreateNew);
			await terminal.runCommand(TerminalCommandId.Join);
			await terminal.getTabLabels(2, true);
		});

		it('should do nothing when unsplit tabs called with no splits', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runCommand(TerminalCommandId.CreateNew);
			await terminal.getTabLabels(2, false);
			await terminal.runCommand(TerminalCommandId.Unsplit);
			await terminal.getTabLabels(2, false);
		});

		it('should unsplit tabs', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runCommand(TerminalCommandId.Split);
			await terminal.getTabLabels(2, true);
			await terminal.runCommand(TerminalCommandId.Unsplit);
			await terminal.getTabLabels(2, false, t => t.every(label => !label.textContent.startsWith('┌') && !label.textContent.startsWith('└')));
		});
	});
}
