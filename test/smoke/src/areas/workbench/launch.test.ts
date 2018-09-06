/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Application } from '../../application';

export function setup() {
	describe('Launch', () => {
		it(`verifies that application launches when user data directory has non-ascii characters`, async function () {
			const app = this.app as Application;
			await app.restart({ userDataDir: path.join(app.userDataPath, 'abcdø') });
		});
	});
}