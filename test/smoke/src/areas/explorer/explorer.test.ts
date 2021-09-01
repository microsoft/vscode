/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import minimist = require('minimist');
import { Application } from '../../../../automation';
import { afterSuite, beforeSuite } from '../../utils';

export function setup(opts: minimist.ParsedArgs) {
	describe('Explorer', () => {
		beforeSuite(opts);

		afterSuite(opts);

		it('shows explorer and opens a file', async function () {
			const app = this.app as Application;
			await app.workbench.explorer.openExplorerView();
			await app.workbench.explorer.openFile('app.js');
		});
	});
}
