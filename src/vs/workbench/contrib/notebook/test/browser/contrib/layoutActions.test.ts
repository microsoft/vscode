/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ToggleCellToolbarPositionAction } from '../../../browser/contrib/layout/layoutActions.js';

suite('Notebook Layout Actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Toggle Cell Toolbar Position', async function () {
		const action = new ToggleCellToolbarPositionAction();

		// "notebook.cellToolbarLocation": "right" -> "left"
		assert.strictEqual(action.togglePosition('right'), 'left');

		// "notebook.cellToolbarLocation": "left" -> "right"
		assert.strictEqual(action.togglePosition('left'), 'right');

		// "notebook.cellToolbarLocation": "hidden" -> "right"
		assert.strictEqual(action.togglePosition('hidden'), 'right');

		// invalid value -> "left" (as if toggling from default "right")
		assert.strictEqual(action.togglePosition(''), 'left');
	});
});
