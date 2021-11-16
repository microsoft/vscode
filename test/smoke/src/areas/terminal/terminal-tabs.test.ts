/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok } from 'assert';
import { ParsedArgs } from 'minimist';
import { Application } from '../../../../automation/out';
import { afterSuite, beforeSuite } from '../../utils';

export function setup(opts: ParsedArgs) {
	describe('Terminal Tabs', () => {
		let app: Application;

		const enum TerminalCommandId {
			Rename = 'workbench.action.terminal.rename',
			ChangeColor = 'workbench.action.terminal.changeColor',
			ChangeIcon = 'workbench.action.terminal.changeIcon',
			Split = 'workbench.action.terminal.split',
			Kill = 'workbench.action.terminal.kill'
		}

		beforeSuite(opts);
		afterSuite(opts);

		before(function () {
			app = this.app;
		});

		afterEach(async function () {
			await app.workbench.terminal.runCommand(TerminalCommandId.Kill);
		});

		it('clicking the plus button should create a terminal and display the tabs view showing no split decorations', async function () {
			await app.workbench.terminal.show();
			await app.code.waitAndClick('li.action-item.monaco-dropdown-with-primary > div.action-container.menu-entry > a');
			const tabLabels = await app.workbench.terminal.getTabLabels(2);
			ok(!tabLabels[0].startsWith('┌') && !tabLabels[1].startsWith('└'));
			await app.workbench.terminal.runCommand(TerminalCommandId.Kill);
		});

		it('should update color of the single tab', async function () {
			await app.workbench.terminal.show();
			await app.workbench.terminal.runCommand(TerminalCommandId.ChangeColor, 'cyan');
			const singleTab = await app.code.waitForElement('.single-terminal-tab');
			ok(singleTab.className.includes('terminal-icon-terminal_ansiCyan'));
		});

		it('should update color of the tab in the tabs list', async function () {
			await app.workbench.terminal.show();
			await app.workbench.terminal.runCommand(TerminalCommandId.Split);
			const tabs = await app.workbench.terminal.getTabLabels(2);
			ok(tabs[0].startsWith('┌'));
			ok(tabs[1].startsWith('└'));
			await app.workbench.terminal.runCommand(TerminalCommandId.ChangeColor, 'cyan');
			await app.code.waitForElement('.terminal-tabs-entry .terminal-icon-terminal_ansiCyan');
			await app.workbench.terminal.runCommand(TerminalCommandId.Kill);
		});

		it('should update icon of the single tab', async function () {
			await app.workbench.terminal.show();
			const icon = 'symbol-method';
			await app.workbench.terminal.runCommand(TerminalCommandId.ChangeIcon, icon);
			await app.code.waitForElement(`.single-terminal-tab .codicon-${icon}`);
		});

		it('should update icon of the tab in the tabs list', async function () {
			await app.workbench.terminal.show();
			await app.workbench.terminal.runCommand(TerminalCommandId.Split);
			const tabs = await app.workbench.terminal.getTabLabels(2);
			ok(tabs[0].startsWith('┌'));
			ok(tabs[1].startsWith('└'));
			const icon = 'symbol-method';
			await app.workbench.terminal.runCommand(TerminalCommandId.ChangeIcon, icon);
			await app.code.waitForElement(`.terminal-tabs-entry .codicon-${icon}`);
			await app.workbench.terminal.runCommand(TerminalCommandId.Kill);
		});

		it('should rename the single tab', async function () {
			await app.workbench.terminal.show();
			const name = 'my terminal name';
			await app.workbench.terminal.runCommand(TerminalCommandId.Rename, name);
			await app.code.waitForElement('.single-terminal-tab', e => e ? e?.textContent.includes(name) : false);
		});

		it('should rename the tab in the tabs list', async function () {
			await app.workbench.terminal.show();
			await app.workbench.terminal.runCommand(TerminalCommandId.Split);
			const tabs = await app.workbench.terminal.getTabLabels(2);
			ok(tabs[0].startsWith('┌'));
			ok(tabs[1].startsWith('└'));
			console.log(tabs);
			const name = 'my terminal name';
			await app.workbench.terminal.runCommand(TerminalCommandId.Rename, name);
			ok(tabs[1].includes(name));
			await app.workbench.terminal.runCommand(TerminalCommandId.Kill);
		});

		//TODO: test hasText when tabs view panel width is changed
		// TODO: test changeColorInstance changeColorPanel
		//TODO: test renamePanel
	});
}
