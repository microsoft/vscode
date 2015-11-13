/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import * as assert from 'assert';
import { multiply64, leftRotate } from 'vs/base/common/bits/bits';

suite('Bits', () => {
	test('multiply64', function() {
		assert.deepEqual(multiply64(0, 0), [0, 0]);
		assert.deepEqual(multiply64(0, 1), [0, 0]);
		assert.deepEqual(multiply64(1, 0), [0, 0]);
		assert.deepEqual(multiply64(1, 1), [0, 1]);

		assert.deepEqual(multiply64(42, 1), [0, 42]);
		assert.deepEqual(multiply64(42, 10), [0, 420]);
		assert.deepEqual(multiply64(42, 100), [0, 4200]);
		assert.deepEqual(multiply64(100, 42), [0, 4200]);
		assert.deepEqual(multiply64(10, 42), [0, 420]);
		assert.deepEqual(multiply64(1, 42), [0, 42]);

		assert.deepEqual(multiply64(0xffff, 0xffff), [0, 0xfffe0001]);
		assert.deepEqual(multiply64(0xffffffff, 2), [1, 0xfffffffe]);
		assert.deepEqual(multiply64(0xffffffff, 0xefef), [0xefee, 0xffff1011]);
		assert.deepEqual(multiply64(0xffffffff, 0xffffffff), [0xfffffffe, 0x1]);
	});

	test('leftRotate', function() {
		assert.deepEqual(leftRotate(0, 0), 0);
		assert.deepEqual(leftRotate(0, 1), 0);
		assert.deepEqual(leftRotate(0, 10), 0);
		assert.deepEqual(leftRotate(0, 31), 0);
		assert.deepEqual(leftRotate(0, 32), 0);

		assert.deepEqual(leftRotate(1, 0), 1);
		assert.deepEqual(leftRotate(1, 1), 2);
		assert.deepEqual(leftRotate(1, 10), 1024);
		assert.deepEqual(leftRotate(1, 31), 0x80000000);
		assert.deepEqual(leftRotate(1, 32), 1);

		assert.deepEqual(leftRotate(0x80000000, 1), 1);

		assert.deepEqual(leftRotate(0xc0000000, 1), 0x80000001);
		assert.deepEqual(leftRotate(0xc0000000, 2), 3);
		assert.deepEqual(leftRotate(0xc0000000, 3), 6);
	});
});
