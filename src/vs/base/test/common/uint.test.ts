/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Constants, toUint8, toUint32 } from '../../common/uint.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('uint', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('toUint8', () => {
		assert.strictEqual(toUint8(-1), 0);
		assert.strictEqual(toUint8(-100), 0);
		assert.strictEqual(toUint8(0), 0);
		assert.strictEqual(toUint8(1), 1);
		assert.strictEqual(toUint8(127), 127);
		assert.strictEqual(toUint8(255), 255);
		assert.strictEqual(toUint8(256), Constants.MAX_UINT_8);
		assert.strictEqual(toUint8(1000), Constants.MAX_UINT_8);
		assert.strictEqual(toUint8(42.8), 42);
	});

	test('toUint32', () => {
		assert.strictEqual(toUint32(-1), 0);
		assert.strictEqual(toUint32(-1000), 0);
		assert.strictEqual(toUint32(0), 0);
		assert.strictEqual(toUint32(1), 1);
		assert.strictEqual(toUint32(2147483647), 2147483647);
		// Values >= 2^31 should stay positive unsigned 32-bit integers
		assert.strictEqual(toUint32(2147483648), 2147483648);
		assert.strictEqual(toUint32(3000000000), 3000000000);
		assert.strictEqual(toUint32(Constants.MAX_UINT_32), Constants.MAX_UINT_32);
		assert.strictEqual(toUint32(5000000000), Constants.MAX_UINT_32);
		assert.strictEqual(toUint32(12345.67), 12345);
	});
});
