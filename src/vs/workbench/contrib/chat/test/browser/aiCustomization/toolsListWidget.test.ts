/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isToolsTreeKeyboardTarget } from '../../../browser/aiCustomization/toolsListWidget.js';

suite('toolsListWidget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('handles tree keys only from the row itself', () => {
		const row = document.createElement('div');
		const moreButton = document.createElement('button');
		row.appendChild(moreButton);

		assert.deepStrictEqual({
			row: isToolsTreeKeyboardTarget(row, row),
			moreButton: isToolsTreeKeyboardTarget(moreButton, row),
		}, {
			row: true,
			moreButton: false,
		});
	});
});
