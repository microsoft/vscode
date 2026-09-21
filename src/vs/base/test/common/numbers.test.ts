/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { formatTokenCount, isPointWithinTriangle } from '../../common/numbers.js';

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

suite('formatTokenCount', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns M for counts above 900K', () => {
		assert.strictEqual(formatTokenCount(1_000_000), '1M');
		assert.strictEqual(formatTokenCount(935_997), '1M');
		assert.strictEqual(formatTokenCount(1_050_000), '1M');
		assert.strictEqual(formatTokenCount(1_100_000), '1.1M');
		assert.strictEqual(formatTokenCount(1_500_000), '1.5M');
		assert.strictEqual(formatTokenCount(1_990_000), '1.9M');
		assert.strictEqual(formatTokenCount(2_000_000), '2M');
		assert.strictEqual(formatTokenCount(2_500_000), '2.5M');
	});

	test('returns K for counts between 1000 and 900K', () => {
		assert.strictEqual(formatTokenCount(200_000), '200K');
		assert.strictEqual(formatTokenCount(128_000), '128K');
		assert.strictEqual(formatTokenCount(1_000), '1K');
		assert.strictEqual(formatTokenCount(900_000), '900K');
	});

	test('returns raw number for counts below 1000', () => {
		assert.strictEqual(formatTokenCount(500), '500');
		assert.strictEqual(formatTokenCount(0), '0');
	});
});
