/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

export function setup(logger: Logger) {
	describe('Editor', () => {

		// Shared before/after handling
		installAllHandlers(logger);

		it('shows correct quick outline', async function () {
			const app = this.app as Application;
			await app.workbench.quickaccess.openFile('www');

			await app.workbench.quickaccess.openQuickOutline();
			await app.workbench.quickinput.waitForQuickInputElements(names => names.length >= 6);
		});
	});
}
