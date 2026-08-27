/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Application, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

export function setup(logger: Logger) {
	describe('Quick Access', () => {

		installAllHandlers(logger);

		it('does not run a fuzzy command match', async function () {
			const app = this.app as Application;

			await assert.rejects(
				app.workbench.quickaccess.runCommand('workbench.action.chat.newChat'),
				/QuickAccess\.runCommand\(command: workbench\.action\.chat\.newChat, match: exactCommandId\) failed to find command\./
			);
			await app.workbench.quickinput.waitForQuickInputClosed();
		});
	});
}
