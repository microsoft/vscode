/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Intentional PR Check Failure', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('fails for draft PR validation', () => {
		assert.strictEqual('expected failure', 'intentional failure');
	});
});
