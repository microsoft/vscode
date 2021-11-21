/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { ParsedArgs } from 'minimist';
import { Terminal, TerminalCommandId } from '../../../../automation/out';
import { afterSuite, beforeSuite, timeout } from '../../utils';

export function setup(opts: ParsedArgs) {
	describe.only('Terminal Multiroot', () => {
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
			await timeout(4000000);
		});
	});
}
