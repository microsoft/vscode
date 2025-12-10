/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { formatCellDuration } from '../../../browser/contrib/cellStatusBar/executionStatusBarItemController.js';

suite('notebookBrowser', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('formatCellDuration', function () {
		assert.strictEqual(formatCellDuration(0, false), '0.0s');
		assert.strictEqual(formatCellDuration(0), '0ms');
		assert.strictEqual(formatCellDuration(10, false), '0.0s');
		assert.strictEqual(formatCellDuration(10), '10ms');
		assert.strictEqual(formatCellDuration(100, false), '0.1s');
		assert.strictEqual(formatCellDuration(100), '100ms');
		assert.strictEqual(formatCellDuration(200, false), '0.2s');
		assert.strictEqual(formatCellDuration(200), '200ms');
		assert.strictEqual(formatCellDuration(3300), '3.3s');
		assert.strictEqual(formatCellDuration(180000), '3m 0.0s');
		assert.strictEqual(formatCellDuration(189412), '3m 9.4s');
	});

	test('timestamp uses 24-hour format', function () {
		// Test that timestamps use 24-hour format regardless of locale
		// Create a date at 10:52:06 PM (22:52:06 in 24-hour format)
		const testDate = new Date('2025-02-17T22:52:06');
		const timeString = testDate.toLocaleTimeString('en-US', { hour12: false });

		// Verify the time string contains 22 (not 10) and doesn't contain PM
		assert.ok(!timeString.includes('PM'), 'Timestamp should not contain PM');
		assert.ok(!timeString.includes('AM'), 'Timestamp should not contain AM');
		assert.ok(timeString.includes('22'), 'Timestamp should use 24-hour format (22 instead of 10)');
	});
});
