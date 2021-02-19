/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getDefaultUserDataPath } from 'vs/base/node/userDataPath';

suite('User data path', () => {

	test('getDefaultUserDataPath', () => {
		const path = getDefaultUserDataPath();
		assert.ok(path.length > 0);
	});
});
