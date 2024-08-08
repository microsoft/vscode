/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { withTestNotebook } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Event } from 'vs/base/common/event';

suite('CellDecorations', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Add and remove a cell decoration', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel) => {
				const cell = viewModel.cellAt(0);
				assert.ok(cell);

				let added = false;
				Event.once(cell.onCellDecorationsChanged)(e => added = !!e.added.find(decoration => decoration.className === 'style1'));

				const decorationIds = cell.deltaCellDecorations([], [{ className: 'style1' }]);
				assert.ok(cell.getCellDecorations().find(dec => dec.className === 'style1'));

				let removed = false;
				Event.once(cell.onCellDecorationsChanged)(e => removed = !!e.removed.find(decoration => decoration.className === 'style1'));
				cell.deltaCellDecorations(decorationIds, []);

				assert.ok(!cell.getCellDecorations().find(dec => dec.className === 'style1'));
				assert.ok(added);
				assert.ok(removed);
			});
	});

	test('Removing one cell decoration should not remove all', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel) => {
				const cell = viewModel.cellAt(0);
				assert.ok(cell);

				const decorationIds = cell.deltaCellDecorations([], [{ className: 'style1', outputClassName: 'style1' }]);
				cell.deltaCellDecorations([], [{ className: 'style1' }]);

				let styleRemoved = false;
				let outputStyleRemoved = false;
				Event.once(cell.onCellDecorationsChanged)(e => {
					styleRemoved = !!e.removed.find(decoration => decoration.className === 'style1');
					outputStyleRemoved = !!e.removed.find(decoration => decoration.outputClassName === 'style1');
				});
				// remove the first style added, which should only remove the output class
				cell.deltaCellDecorations(decorationIds, []);

				assert.ok(!cell.getCellDecorations().find(dec => dec.outputClassName === 'style1'));
				assert.ok(cell.getCellDecorations().find(dec => dec.className === 'style1'));
				assert.ok(!styleRemoved);
				assert.ok(outputStyleRemoved);
			});
	});
});
