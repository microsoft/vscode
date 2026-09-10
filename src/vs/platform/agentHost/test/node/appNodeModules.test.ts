/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAppNodeModulesUri } from '../../node/appNodeModules.js';

suite('appNodeModules', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the injected development node_modules path', () => {
		assert.strictEqual(getAppNodeModulesUri('/test/dev-remote/node_modules/').path, '/test/dev-remote/node_modules/');
	});
});
