/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok } from 'assert';
import { ParsedArgs } from 'minimist';
import { Application } from '../../../../automation';
import { afterSuite, beforeSuite } from '../../utils';

const ContributedProfileName = `JavaScript Debug Terminal`;

export function setup(opts: ParsedArgs) {
	describe.only('Terminal Profiles', () => {
		let app: Application;
		const enum TerminalCommandId {
			Rename = 'workbench.action.terminal.rename',
			ChangeColor = 'workbench.action.terminal.changeColor',
			ChangeIcon = 'workbench.action.terminal.changeIcon',
			Split = 'workbench.action.terminal.split',
			KillAll = 'workbench.action.terminal.killAll'
		}
		beforeSuite(opts);
		afterSuite(opts);

		before(function () {
			app = this.app;
		});

		afterEach(async function () {
			await app.workbench.terminal.runCommand(TerminalCommandId.KillAll);
			await app.code.waitForActiveElement('.editor-group-container.empty.active');
		});

		it('should launch the default profile', async function () {
			await app.workbench.terminal.show();
			await app.code.waitForElement('.single-terminal-tab', e => e ? !e.textContent.endsWith(ContributedProfileName) : false);
		});

		it('should set the default profile to a contributed one', async function () {
			await app.workbench.terminal.runProfileCommand('setDefault', true);
			await app.workbench.terminal.createNew();
			await app.code.waitForElement('.single-terminal-tab', e => e ? e.textContent.endsWith(ContributedProfileName) : false);
		});

		it('should use the default contributed profile on panel open and for splitting', async function () {
			await app.workbench.terminal.runProfileCommand('setDefault', true);
			await app.workbench.terminal.show();
			await app.workbench.terminal.runCommand(TerminalCommandId.Split);
			const tabs = await app.workbench.terminal.getTabLabels(2);
			ok(tabs[0].startsWith('┌') && tabs[0].endsWith(ContributedProfileName));
			ok(tabs[1].startsWith('└'));
		});

		it('should set the default profile', async function () {
			await app.workbench.terminal.runProfileCommand('setDefault', undefined);
			await app.workbench.terminal.createNew();
			await app.code.waitForElement('.single-terminal-tab', e => e ? !e.textContent.endsWith(ContributedProfileName) : false);
		});

		it('should use the default profile on panel open and for splitting', async function () {
			await app.workbench.terminal.show();
			await app.code.waitForElement('.single-terminal-tab', e => e ? !e.textContent.endsWith(ContributedProfileName) : false);
			await app.workbench.terminal.runCommand(TerminalCommandId.Split);
			const tabs = await app.workbench.terminal.getTabLabels(2, true);
			ok(tabs[0].startsWith('┌') && !tabs[0].endsWith(ContributedProfileName));
			ok(tabs[1].startsWith('└') && !tabs[1].endsWith(ContributedProfileName));
		});

		it('clicking the plus button should create a terminal and display the tabs view showing no split decorations', async function () {
			await app.workbench.terminal.show();
			await app.code.waitAndClick('li.action-item.monaco-dropdown-with-primary > div.action-container.menu-entry > a');
			const tabLabels = await app.workbench.terminal.getTabLabels(2);
			ok(!tabLabels[0].startsWith('┌') && !tabLabels[1].startsWith('└'));
		});

		it('createWithProfile command should create a terminal with a profile', async function () {
			await app.workbench.terminal.runProfileCommand('createInstance');
			await app.code.waitForElement('.single-terminal-tab', e => e ? !e.textContent.endsWith(ContributedProfileName) : false);
		});

		it('createWithProfile command should create a terminal with a contributed profile', async function () {
			await app.workbench.terminal.runProfileCommand('createInstance', true);
			await app.code.waitForElement('.single-terminal-tab', e => e ? e.textContent.endsWith(ContributedProfileName) : false);
		});

		it('createWithProfile command should create a split terminal with a profile', async function () {
			await app.workbench.terminal.show();
			await app.workbench.terminal.runProfileCommand('createInstance', undefined, true);
			const tabs = await app.workbench.terminal.getTabLabels(2, true);
			ok(tabs[0].startsWith('┌') && !tabs[0].endsWith(ContributedProfileName));
			ok(tabs[1].startsWith('└') && !tabs[1].endsWith(ContributedProfileName));
		});

		it('createWithProfile command should create a split terminal with a contributed profile', async function () {
			await app.workbench.terminal.show();
			await app.code.waitForElement('.single-terminal-tab', e => e ? !e.textContent.endsWith(ContributedProfileName) : false);
			await app.workbench.terminal.runProfileCommand('createInstance', true, true);
			const tabs = await app.workbench.terminal.getTabLabels(2, true);
			ok(tabs[0].startsWith('┌') && !tabs[0].endsWith(ContributedProfileName));
			ok(tabs[1].startsWith('└') && tabs[1].endsWith(ContributedProfileName));
		});
	});
}
