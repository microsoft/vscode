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
});
