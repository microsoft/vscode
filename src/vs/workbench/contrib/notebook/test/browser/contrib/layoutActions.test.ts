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

		// "notebook.cellToolbarLocation": "right"
		assert.deepStrictEqual(action.togglePosition('test-nb', 'right'), {
			default: 'right',
			'test-nb': 'left'
		});

		// "notebook.cellToolbarLocation": "left"
		assert.deepStrictEqual(action.togglePosition('test-nb', 'left'), {
			default: 'left',
			'test-nb': 'right'
		});

		// "notebook.cellToolbarLocation": "hidden"
		assert.deepStrictEqual(action.togglePosition('test-nb', 'hidden'), {
			default: 'hidden',
			'test-nb': 'right'
		});

		// invalid
		assert.deepStrictEqual(action.togglePosition('test-nb', ''), {
			default: 'right',
			'test-nb': 'left'
		});

		// no user config, default value
		assert.deepStrictEqual(action.togglePosition('test-nb', {
			default: 'right'
		}), {
			default: 'right',
			'test-nb': 'left'
		});

		// user config, default to left
		assert.deepStrictEqual(action.togglePosition('test-nb', {
			default: 'left'
		}), {
			default: 'left',
			'test-nb': 'right'
		});

		// user config, default to hidden
		assert.deepStrictEqual(action.togglePosition('test-nb', {
			default: 'hidden'
		}), {
			default: 'hidden',
			'test-nb': 'right'
		});
	});
});
