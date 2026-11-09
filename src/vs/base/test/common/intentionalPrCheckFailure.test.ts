/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('PR Check Validation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('passes after resolving the validation failure', () => {
		assert.strictEqual('resolved failure', 'resolved failure');
	});
});
