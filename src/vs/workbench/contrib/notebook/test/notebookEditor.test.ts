/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mock } from 'vs/base/test/common/mock';
import { FoldingModel, updateFoldingStateAtIndex } from 'vs/workbench/contrib/notebook/browser/contrib/fold/foldingModel';
import { expandCellRangesWithHiddenCells, ICellViewModel, INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { ListViewInfoAccessor } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { createNotebookCellList, setupInstantiationService, withTestNotebook } from 'vs/workbench/contrib/notebook/test/testNotebookEditor';

suite('ListViewInfoAccessor', () => {
	const instantiationService = setupInstantiationService();

	test('basics', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markdown, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markdown, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			(editor) => {
				const viewModel = editor.viewModel;
				const foldingModel = new FoldingModel();
				foldingModel.attachViewModel(viewModel);

				const cellList = createNotebookCellList(instantiationService);
				cellList.attachViewModel(viewModel);
				const listViewInfoAccessor = new ListViewInfoAccessor(cellList);

				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.viewCells[0]), 0);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.viewCells[1]), 1);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.viewCells[2]), 2);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.viewCells[3]), 3);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.viewCells[4]), 4);
				assert.deepStrictEqual(listViewInfoAccessor.getCellRangeFromViewRange(0, 1), { start: 0, end: 1 });
				assert.deepStrictEqual(listViewInfoAccessor.getCellRangeFromViewRange(1, 2), { start: 1, end: 2 });

				updateFoldingStateAtIndex(foldingModel, 0, true);
				updateFoldingStateAtIndex(foldingModel, 2, true);
				viewModel.updateFoldingRanges(foldingModel.regions);
				cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);

				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.viewCells[0]), 0);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.viewCells[1]), -1);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.viewCells[2]), 1);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.viewCells[3]), -1);
				assert.strictEqual(listViewInfoAccessor.getViewIndex(viewModel.viewCells[4]), -1);

				assert.deepStrictEqual(listViewInfoAccessor.getCellRangeFromViewRange(0, 1), { start: 0, end: 2 });
				assert.deepStrictEqual(listViewInfoAccessor.getCellRangeFromViewRange(1, 2), { start: 2, end: 5 });
				assert.deepStrictEqual(listViewInfoAccessor.getCellsFromViewRange(0, 1), viewModel.viewCells.slice(0, 2));
				assert.deepStrictEqual(listViewInfoAccessor.getCellsFromViewRange(1, 2), viewModel.viewCells.slice(2));

				const notebookEditor = new class extends mock<INotebookEditor>() {
					getViewIndex(cell: ICellViewModel) { return listViewInfoAccessor.getViewIndex(cell); }
					getCellRangeFromViewRange(startIndex: number, endIndex: number) { return listViewInfoAccessor.getCellRangeFromViewRange(startIndex, endIndex); }
				};

				assert.deepStrictEqual(expandCellRangesWithHiddenCells(notebookEditor, viewModel, [{ start: 0, end: 1 }]), [{ start: 0, end: 2 }]);
				assert.deepStrictEqual(expandCellRangesWithHiddenCells(notebookEditor, viewModel, [{ start: 2, end: 3 }]), [{ start: 2, end: 5 }]);
				assert.deepStrictEqual(expandCellRangesWithHiddenCells(notebookEditor, viewModel, [{ start: 0, end: 1 }, { start: 2, end: 3 }]), [{ start: 0, end: 5 }]);
			});
	});
});
