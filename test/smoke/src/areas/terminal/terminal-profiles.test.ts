/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ParsedArgs } from 'minimist';
import { Terminal, TerminalCommandId, TerminalCommandIdWithValue } from '../../../../automation';
import { afterSuite, beforeSuite } from '../../utils';

const CONTRIBUTED_PROFILE_NAME = `JavaScript Debug Terminal`;
const ANY_PROFILE_NAME = '^((?!JavaScript Debug Terminal).)*$';

export function setup(opts: ParsedArgs) {
	describe('Terminal Profiles', () => {
		let terminal: Terminal;

		beforeSuite(opts);
		afterSuite(opts);

		before(function () {
			terminal = this.app.workbench.terminal;
		});

		afterEach(async () => {
			await terminal.runCommand(TerminalCommandId.KillAll);
		});

		it('should launch the default profile', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.assertSingleTab({ name: ANY_PROFILE_NAME });
		});

		it.skip('should set the default profile to a contributed one', async () => {
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.SelectDefaultProfile, CONTRIBUTED_PROFILE_NAME);
			await terminal.runCommand(TerminalCommandId.CreateNew);
			await terminal.assertSingleTab({ name: CONTRIBUTED_PROFILE_NAME });
		});

		it.skip('should use the default contributed profile on panel open and for splitting', async () => {
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.SelectDefaultProfile, CONTRIBUTED_PROFILE_NAME);
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runCommand(TerminalCommandId.Split);
			await terminal.assertTerminalGroups([[{ name: CONTRIBUTED_PROFILE_NAME }, { name: CONTRIBUTED_PROFILE_NAME }]]);
		});

		it('should set the default profile', async () => {
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.SelectDefaultProfile);
			await terminal.runCommand(TerminalCommandId.CreateNew);
			await terminal.assertSingleTab({ name: ANY_PROFILE_NAME });
		});

		it('should use the default profile on panel open and for splitting', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.assertSingleTab({ name: ANY_PROFILE_NAME });
			await terminal.runCommand(TerminalCommandId.Split);
			await terminal.assertTerminalGroups([[{}, {}]]);
		});

		it('createWithProfile command should create a terminal with a profile', async () => {
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.NewWithProfile);
			await terminal.assertSingleTab({ name: ANY_PROFILE_NAME });
		});

		it.skip('createWithProfile command should create a terminal with a contributed profile', async () => {
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.NewWithProfile, CONTRIBUTED_PROFILE_NAME);
			await terminal.assertSingleTab({ name: CONTRIBUTED_PROFILE_NAME });
		});

		it('createWithProfile command should create a split terminal with a profile', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.NewWithProfile, undefined, true);
			await terminal.assertTerminalGroups([[{}, {}]]);
		});

		it.skip('createWithProfile command should create a split terminal with a contributed profile', async () => {
			await terminal.runCommand(TerminalCommandId.Show);
			await terminal.assertSingleTab({});
			await terminal.runCommandWithValue(TerminalCommandIdWithValue.NewWithProfile, CONTRIBUTED_PROFILE_NAME, true);
			await terminal.assertTerminalGroups([[{ name: ANY_PROFILE_NAME }, { name: CONTRIBUTED_PROFILE_NAME }]]);
		});
	});
}
