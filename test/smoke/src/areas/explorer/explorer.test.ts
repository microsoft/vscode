/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import minimist = require('minimist');
import { Application } from '../../../../automation';
import { afterSuite, beforeSuite } from '../../utils';

export function setup(opts: minimist.ParsedArgs) {
	describe('Explorer', () => {
		beforeSuite(opts);

		afterSuite(opts);

		it.skip('shows explorer and opens a file', async function () {
			const app = this.app as Application;
			await app.workbench.explorer.openExplorerView();

			await new Promise(c => setTimeout(c, 500));

			await app.workbench.explorer.openFile('app.js');
		});
	});
}
