/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import minimist = require('minimist');
import { Application } from '../../../../automation';
import { installCommonTestHandlers } from '../../utils';

export function setup(opts: minimist.ParsedArgs) {
	describe('Editor', () => {

		// Shared before/after handling
		installCommonTestHandlers(opts);

		it('shows correct quick outline', async function () {
			const app = this.app as Application;
			await app.workbench.quickaccess.openFile('www');

			await app.workbench.quickaccess.openQuickOutline();
			await app.workbench.quickinput.waitForQuickInputElements(names => names.length >= 6);
		});
	});
}
