/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok } from 'assert';
import { ParsedArgs } from 'minimist';
import { Code, Terminal, TerminalCommandId, TerminalCommandIdWithValue } from '../../../../automation';
import { afterSuite, beforeSuite, timeout } from '../../utils';

const CONTRIBUTED_PROFILE_NAME = `JavaScript Debug Terminal`;
const SINGLE_TAB_SELECTOR = '.single-terminal-tab';

export function setup(opts: ParsedArgs) {
	describe('Terminal Profiles', () => {
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

		it('should launch the default profile', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await code.waitForElement(SINGLE_TAB_SELECTOR, e => e ? !e.textContent.endsWith(CONTRIBUTED_PROFILE_NAME) : false);
		});

		it('should set the default profile to a contributed one', async () => {
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.SelectDefaultProfile, CONTRIBUTED_PROFILE_NAME);
			await terminal.runCommand(TerminalCommandId.CreateNew);
			await timeout(2000);
			await code.waitForElement(SINGLE_TAB_SELECTOR, e => e ? e.textContent.endsWith(CONTRIBUTED_PROFILE_NAME) : false);
		});

		it('should use the default contributed profile on panel open and for splitting', async () => {
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.SelectDefaultProfile, CONTRIBUTED_PROFILE_NAME);
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runCommand(TerminalCommandId.Split);
			await timeout(2000);
			const tabs = await terminal.getTabLabels(2);
			ok(tabs[0].startsWith('┌') && tabs[0].endsWith(CONTRIBUTED_PROFILE_NAME));
			ok(tabs[1].startsWith('└') && tabs[1].endsWith(CONTRIBUTED_PROFILE_NAME));
		});

		it('should set the default profile', async () => {
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.SelectDefaultProfile);
			await terminal.runCommand(TerminalCommandId.CreateNew);
			await code.waitForElement(SINGLE_TAB_SELECTOR, e => e ? !e.textContent.endsWith(CONTRIBUTED_PROFILE_NAME) : false);
		});

		it('should use the default profile on panel open and for splitting', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await code.waitForElement(SINGLE_TAB_SELECTOR, e => e ? !e.textContent.endsWith(CONTRIBUTED_PROFILE_NAME) : false);
			await terminal.runCommand(TerminalCommandId.Split);
			const tabs = await terminal.getTabLabels(2, true);
			ok(tabs[0].startsWith('┌') && !tabs[0].endsWith(CONTRIBUTED_PROFILE_NAME));
			ok(tabs[1].startsWith('└') && !tabs[1].endsWith(CONTRIBUTED_PROFILE_NAME));
		});

		it('clicking the plus button should create a terminal and display the tabs view showing no split decorations', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.clickPlusButton();
			const tabLabels = await terminal.getTabLabels(2);
			ok(!tabLabels[0].startsWith('┌') && !tabLabels[1].startsWith('└'));
		});

		it('createWithProfile command should create a terminal with a profile', async () => {
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.NewWithProfile);
			await code.waitForElement(SINGLE_TAB_SELECTOR, e => e ? !e.textContent.endsWith(CONTRIBUTED_PROFILE_NAME) : false);
		});

		it('createWithProfile command should create a terminal with a contributed profile', async () => {
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.NewWithProfile, CONTRIBUTED_PROFILE_NAME);
			await timeout(2000);
			await code.waitForElement(SINGLE_TAB_SELECTOR, e => e ? e.textContent.endsWith(CONTRIBUTED_PROFILE_NAME) : false);
		});

		it('createWithProfile command should create a split terminal with a profile', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.NewWithProfile, undefined, true);
			const tabs = await terminal.getTabLabels(2, true);
			ok(tabs[0].startsWith('┌') && !tabs[0].endsWith(CONTRIBUTED_PROFILE_NAME));
			ok(tabs[1].startsWith('└') && !tabs[1].endsWith(CONTRIBUTED_PROFILE_NAME));
		});

		it('createWithProfile command should create a split terminal with a contributed profile', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await timeout(2000);
			await code.waitForElement(SINGLE_TAB_SELECTOR, e => e ? !e.textContent.endsWith(CONTRIBUTED_PROFILE_NAME) : false);
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.NewWithProfile, CONTRIBUTED_PROFILE_NAME, true);
			await timeout(2000);
			const tabs = await terminal.getTabLabels(2, true);
			ok(tabs[0].startsWith('┌') && !tabs[0].endsWith(CONTRIBUTED_PROFILE_NAME));
			ok(tabs[1].startsWith('└') && tabs[1].endsWith(CONTRIBUTED_PROFILE_NAME));
		});
	});
}
