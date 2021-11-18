/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok } from 'assert';
import { ParsedArgs } from 'minimist';
import { Code, Terminal } from '../../../../automation';
import { afterSuite, beforeSuite } from '../../utils';

const ContributedProfileName = `JavaScript Debug Terminal`;

export function setup(opts: ParsedArgs) {

	describe('Terminal Profiles', () => {
		let code: Code;
		let terminal: Terminal;
		const enum TerminalCommandId {
			Split = 'workbench.action.terminal.split',
			KillAll = 'workbench.action.terminal.killAll',
			Show = 'workbench.action.terminal.toggleTerminal',
			CreateNew = 'workbench.action.terminal.new',
			NewWithProfile = 'workbench.action.terminal.newWithProfile',
			SelectDefaultProfile = 'workbench.action.terminal.selectDefaultShell'
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

		it('should launch the default profile', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			// TODO: Use getSingleTabLabel? Share logic with getTabLabel?
			await code.waitForElement('.single-terminal-tab', e => e ? !e.textContent.endsWith(ContributedProfileName) : false);
		});

		it.skip('should set the default profile to a contributed one', async () => {
			await terminal.runProfileCommand(TerminalCommandId.SelectDefaultProfile, true);
			await terminal.runCommand(TerminalCommandId.CreateNew);
			await code.waitForElement('.single-terminal-tab', e => e ? e.textContent.endsWith(ContributedProfileName) : false);
		});

		it.skip('should use the default contributed profile on panel open and for splitting', async () => {
			await terminal.runProfileCommand(TerminalCommandId.SelectDefaultProfile, true);
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runCommand(TerminalCommandId.Split);
			const tabs = await terminal.getTabLabels(2);
			console.log('DEBUG: tabs', tabs);
			ok(tabs[0].startsWith('┌') && tabs[0].endsWith(ContributedProfileName));
			ok(tabs[1].startsWith('└') && tabs[1].endsWith(ContributedProfileName));
		});

		it('should set the default profile', async () => {
			await terminal.runProfileCommand(TerminalCommandId.SelectDefaultProfile, undefined);
			await terminal.runCommand(TerminalCommandId.CreateNew);
			await code.waitForElement('.single-terminal-tab', e => e ? !e.textContent.endsWith(ContributedProfileName) : false);
		});

		it('should use the default profile on panel open and for splitting', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await code.waitForElement('.single-terminal-tab', e => e ? !e.textContent.endsWith(ContributedProfileName) : false);
			await terminal.runCommand(TerminalCommandId.Split);
			const tabs = await terminal.getTabLabels(2, true);
			ok(tabs[0].startsWith('┌') && !tabs[0].endsWith(ContributedProfileName));
			ok(tabs[1].startsWith('└') && !tabs[1].endsWith(ContributedProfileName));
		});

		it('clicking the plus button should create a terminal and display the tabs view showing no split decorations', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await code.waitAndClick('li.action-item.monaco-dropdown-with-primary > div.action-container.menu-entry > a');
			const tabLabels = await terminal.getTabLabels(2);
			ok(!tabLabels[0].startsWith('┌') && !tabLabels[1].startsWith('└'));
		});

		it('createWithProfile command should create a terminal with a profile', async () => {
			await terminal.runProfileCommand(TerminalCommandId.NewWithProfile);
			await code.waitForElement('.single-terminal-tab', e => e ? !e.textContent.endsWith(ContributedProfileName) : false);
		});

		it.skip('createWithProfile command should create a terminal with a contributed profile', async () => {
			await terminal.runProfileCommand(TerminalCommandId.NewWithProfile, true);
			await code.waitForElement('.single-terminal-tab', e => e ? e.textContent.endsWith(ContributedProfileName) : false);
		});

		it('createWithProfile command should create a split terminal with a profile', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runProfileCommand(TerminalCommandId.NewWithProfile, undefined, true);
			const tabs = await terminal.getTabLabels(2, true);
			ok(tabs[0].startsWith('┌') && !tabs[0].endsWith(ContributedProfileName));
			ok(tabs[1].startsWith('└') && !tabs[1].endsWith(ContributedProfileName));
		});

		it.skip('createWithProfile command should create a split terminal with a contributed profile', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await code.waitForElement('.single-terminal-tab', e => e ? !e.textContent.endsWith(ContributedProfileName) : false);
			await terminal.runProfileCommand(TerminalCommandId.NewWithProfile, true, true);
			const tabs = await terminal.getTabLabels(2, true);
			ok(tabs[0].startsWith('┌') && !tabs[0].endsWith(ContributedProfileName));
			ok(tabs[1].startsWith('└') && tabs[1].endsWith(ContributedProfileName));
		});
	});
}
