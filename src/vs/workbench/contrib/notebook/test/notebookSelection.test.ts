/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { NotebookCellSelectionCollection } from 'vs/workbench/contrib/notebook/browser/viewModel/cellSelectionCollection';

suite('NotebookSelection', () => {
	test('selection is never empty', function () {
		const selectionCollection = new NotebookCellSelectionCollection();
		assert.deepStrictEqual(selectionCollection.selections, [{ start: 0, end: 0 }]);

		selectionCollection.setState(null, [], true, 'edit');
		assert.deepStrictEqual(selectionCollection.selections, [{ start: 0, end: 0 }]);
	});

	test('selections[0] is primary selection', function () {
		const selectionCollection = new NotebookCellSelectionCollection();
		selectionCollection.setState(null, [{ start: 0, end: 1 }, { start: 3, end: 5 }], true, 'edit');
		assert.deepStrictEqual(selectionCollection.selection, { start: 0, end: 1 });
		assert.deepStrictEqual(selectionCollection.selections, [{ start: 0, end: 1 }, { start: 3, end: 5 }]);

		selectionCollection.setState({ start: 0, end: 1 }, [{ start: 3, end: 5 }], true, 'edit');
		assert.deepStrictEqual(selectionCollection.selection, { start: 0, end: 1 });
		assert.deepStrictEqual(selectionCollection.selections, [{ start: 0, end: 1 }, { start: 3, end: 5 }]);

		selectionCollection.setState({ start: 0, end: 1 }, [], true, 'edit');
		assert.deepStrictEqual(selectionCollection.selection, { start: 0, end: 1 });
		assert.deepStrictEqual(selectionCollection.selections, [{ start: 0, end: 1 }]);

	});
});
