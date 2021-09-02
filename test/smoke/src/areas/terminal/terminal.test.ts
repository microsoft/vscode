/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import minimist = require('minimist');
import { Application } from '../../../../automation';
import { afterSuite, beforeSuite } from '../../utils';

export function setup(opts: minimist.ParsedArgs) {
	describe('Terminal', () => {
		beforeSuite(opts);

		afterSuite(opts);

		it('shows terminal and runs command', async function () {
			const app = this.app as Application;
			await app.workbench.terminal.showTerminal();
			await app.workbench.terminal.runCommand('ls');
			await app.workbench.terminal.waitForTerminalText(lines => lines.some(l => l.includes('app.js')));
		});
	});
}
