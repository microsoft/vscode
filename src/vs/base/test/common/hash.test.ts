/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isStringInSample } from '../../common/hash.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('isStringInSample', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns stable sample membership', () => {
		assert.deepStrictEqual(
			Array.from({ length: 9 }, (_, index) => isStringInSample(`session-${index + 60}`, 5)),
			[false, false, true, true, true, true, true, false, false]
		);
	});

	test('supports sample boundaries', () => {
		assert.deepStrictEqual(
			[isStringInSample('session', 0), isStringInSample('session', 100)],
			[false, true]
		);
	});

	test('rejects invalid percentages', () => {
		assert.throws(() => isStringInSample('session', -1));
		assert.throws(() => isStringInSample('session', 1.5));
		assert.throws(() => isStringInSample('session', 101));
	});
});
