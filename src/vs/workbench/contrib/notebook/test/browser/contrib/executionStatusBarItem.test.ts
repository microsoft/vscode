/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { formatCellDuration } from 'vs/workbench/contrib/notebook/browser/contrib/cellStatusBar/executionStatusBarItemController';

suite('notebookBrowser', () => {
	test('formatCellDuration', function () {
		assert.strictEqual(formatCellDuration(0), '0.0s');
		assert.strictEqual(formatCellDuration(10), '0.1s');
		assert.strictEqual(formatCellDuration(200), '0.2s');
		assert.strictEqual(formatCellDuration(3300), '3.3s');
		assert.strictEqual(formatCellDuration(180000), '3m 0.0s');
		assert.strictEqual(formatCellDuration(189412), '3m 9.4s');
	});
});
