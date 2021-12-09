/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'path';
import { Application, Logger } from '../../../../automation';
import { installCommonAfterHandlers, installCommonBeforeEachHandler, startApp } from '../../utils';

export function setup(logger: Logger) {
	describe('Launch', () => {

		let app: Application | undefined;

		installCommonBeforeEachHandler(logger);
		installCommonAfterHandlers(() => app);

		it(`verifies that application launches when user data directory has non-ascii characters`, async function () {
			const massagedOptions = { ...this.defaultOptions, userDataDir: join(this.defaultOptions.userDataDir, 'ø') };
			app = await startApp(massagedOptions);

			await app.stop();
			app = undefined;
		});
	});
}
