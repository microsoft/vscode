/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import minimist = require('minimist');
import * as path from 'path';
import { Application, ApplicationOptions } from '../../../../automation';
import { afterSuite } from '../../utils';

export function setup(opts: minimist.ParsedArgs) {

	describe('Launch', () => {

		let app: Application;

		afterSuite(opts, () => app);

		it(`verifies that application launches when user data directory has non-ascii characters`, async function () {
			const defaultOptions = this.defaultOptions as ApplicationOptions;
			const options: ApplicationOptions = { ...defaultOptions, userDataDir: path.join(defaultOptions.userDataDir, 'abcdø') };
			app = new Application(options);
			await app.start();
		});
	});
}
