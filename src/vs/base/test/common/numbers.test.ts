/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isPointWithinTriangle } from '../../common/numbers.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('isPointWithinTriangle', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should return true if the point is within the triangle', () => {
		const result = isPointWithinTriangle(0.25, 0.25, 0, 0, 1, 0, 0, 1);
		assert.ok(result);
	});

	test('should return false if the point is outside the triangle', () => {
		const result = isPointWithinTriangle(2, 2, 0, 0, 1, 0, 0, 1);
		assert.ok(!result);
	});

	test('should return true if the point is on the edge of the triangle', () => {
		const result = isPointWithinTriangle(0.5, 0, 0, 0, 1, 0, 0, 1);
		assert.ok(result);
	});
});
