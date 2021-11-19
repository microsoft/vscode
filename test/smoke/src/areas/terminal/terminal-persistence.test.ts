/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { ParsedArgs } from 'minimist';
import { Application, Terminal, TerminalCommandId, TerminalCommandIdWithValue } from '../../../../automation/out';
import { afterSuite, beforeSuite } from '../../utils';

export function setup(opts: ParsedArgs) {
	describe.only('Terminal Persistence', () => {
		let terminal: Terminal;

		beforeSuite(opts);
		afterSuite(opts);

		before(async function () {
			const app = this.app as Application;
			terminal = app.workbench.terminal;

			// Always show tabs to make getting terminal groups easier
			await app.workbench.settingsEditor.addUserSetting('terminal.integrated.tabs.hideCondition', '"never"');
			await app.workbench.quickaccess.runCommand('workbench.action.closeAllEditors');
		});

		afterEach(async () => {
			await terminal.runCommand(TerminalCommandId.KillAll);
		});

		describe('detach/attach', () => {
			it('should support basic reconnection', async () => {
				await terminal.runCommand(TerminalCommandId.CreateNew);
				// TODO: Handle passing in an actual regex, not string
				await terminal.assertTerminalGroups([
					[{ name: '.*' }]
				]);

				const groups = await terminal.getTerminalGroups();
				strictEqual(groups.length, 1);
				strictEqual(groups[0].length, 1);
				ok(groups[0][0].name!.length > 0);
				const detachedName = groups[0][0].name!;
				console.log('detached name', detachedName);

				await terminal.runCommand(TerminalCommandId.DetachSession);
				await terminal.assertTerminalViewHidden();

				await terminal.runCommandWithValue(TerminalCommandIdWithValue.AttachToSession, detachedName);
				await terminal.assertTerminalGroups([
					[{ name: detachedName }]
				]);
			});

			it('should persist buffer content', async () => {
				await terminal.runCommand(TerminalCommandId.CreateNew);
				// TODO: Handle passing in an actual regex, not string
				await terminal.assertTerminalGroups([
					[{ name: '.*' }]
				]);

				const groups = await terminal.getTerminalGroups();
				strictEqual(groups.length, 1);
				strictEqual(groups[0].length, 1);
				ok(groups[0][0].name!.length > 0);
				const detachedName = groups[0][0].name!;

				await terminal.runCommandInTerminal('echo terminal_test_content');
				await terminal.waitForTerminalText(buffer => buffer.some(e => e.includes('terminal_test_content')));

				await terminal.runCommand(TerminalCommandId.DetachSession);
				await terminal.assertTerminalViewHidden();

				await terminal.runCommandWithValue(TerminalCommandIdWithValue.AttachToSession, detachedName);
				await terminal.assertTerminalGroups([
					[{ name: detachedName }]
				]);
				await terminal.waitForTerminalText(buffer => buffer.some(e => e.includes('terminal_test_content')));
			});
		});
	});
}
