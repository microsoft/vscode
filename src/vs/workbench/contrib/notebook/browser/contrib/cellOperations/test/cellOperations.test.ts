/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { copyCellRange, moveCellRange } from 'vs/workbench/contrib/notebook/browser/contrib/cellOperations/cellOperations';
import { FoldingModel, updateFoldingStateAtIndex } from 'vs/workbench/contrib/notebook/browser/contrib/fold/foldingModel';
import { CellKind, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { withTestNotebook } from 'vs/workbench/contrib/notebook/test/testNotebookEditor';

suite('CellOperations', () => {
	test('Move cells - single cell', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markdown, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markdown, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor) => {
				const viewModel = editor.viewModel;
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
				await moveCellRange({ notebookEditor: editor, cell: viewModel.viewCells[1] }, 'down');
				assert.strictEqual(viewModel.viewCells[2].getText(), 'var b = 1;');
			});
	});

	test('Move cells - multiple cells in a selection', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markdown, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markdown, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor) => {
				const viewModel = editor.viewModel;
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 0, end: 2 }] });
				await moveCellRange({ notebookEditor: editor, cell: viewModel.viewCells[1] }, 'down');
				assert.strictEqual(viewModel.viewCells[0].getText(), '# header b');
				assert.strictEqual(viewModel.viewCells[1].getText(), '# header a');
				assert.strictEqual(viewModel.viewCells[2].getText(), 'var b = 1;');
			});
	});

	test('Move cells - move with folding ranges', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markdown, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markdown, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor) => {
				const viewModel = editor.viewModel;
				const foldingModel = new FoldingModel();
				foldingModel.attachViewModel(viewModel);
				updateFoldingStateAtIndex(foldingModel, 0, true);
				updateFoldingStateAtIndex(foldingModel, 1, true);
				viewModel.updateFoldingRanges(foldingModel.regions);
				editor.setHiddenAreas([{ start: 1, end: 2 }]);
				editor.setHiddenAreas(viewModel.getHiddenRanges());

				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] });
				await moveCellRange({ notebookEditor: editor, cell: viewModel.viewCells[1] }, 'down');
				assert.strictEqual(viewModel.viewCells[0].getText(), '# header b');
				assert.strictEqual(viewModel.viewCells[1].getText(), '# header a');
				assert.strictEqual(viewModel.viewCells[2].getText(), 'var b = 1;');
			});
	});

	test('Copy/duplicate cells - single cell', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markdown, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markdown, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor) => {
				const viewModel = editor.viewModel;
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
				await copyCellRange({ notebookEditor: editor, cell: viewModel.viewCells[1] }, 'down');
				assert.strictEqual(viewModel.viewCells.length, 6);
				assert.strictEqual(viewModel.viewCells[1].getText(), 'var b = 1;');
				assert.strictEqual(viewModel.viewCells[2].getText(), 'var b = 1;');
			});
	});

	test('Copy/duplicate cells - multiple cells in a selection', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markdown, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markdown, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor) => {
				const viewModel = editor.viewModel;
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 0, end: 2 }] });
				await copyCellRange({ notebookEditor: editor, cell: viewModel.viewCells[1] }, 'down');
				assert.strictEqual(viewModel.viewCells.length, 7);
				assert.strictEqual(viewModel.viewCells[0].getText(), '# header a');
				assert.strictEqual(viewModel.viewCells[1].getText(), 'var b = 1;');
				assert.strictEqual(viewModel.viewCells[2].getText(), '# header a');
				assert.strictEqual(viewModel.viewCells[3].getText(), 'var b = 1;');
			});
	});

	test('Copy/duplicate cells - move with folding ranges', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markdown, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markdown, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor) => {
				const viewModel = editor.viewModel;
				const foldingModel = new FoldingModel();
				foldingModel.attachViewModel(viewModel);
				updateFoldingStateAtIndex(foldingModel, 0, true);
				updateFoldingStateAtIndex(foldingModel, 1, true);
				viewModel.updateFoldingRanges(foldingModel.regions);
				editor.setHiddenAreas([{ start: 1, end: 2 }]);
				editor.setHiddenAreas(viewModel.getHiddenRanges());

				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] });
				await copyCellRange({ notebookEditor: editor, cell: viewModel.viewCells[1] }, 'down');
				assert.strictEqual(viewModel.viewCells.length, 7);
				assert.strictEqual(viewModel.viewCells[0].getText(), '# header a');
				assert.strictEqual(viewModel.viewCells[1].getText(), 'var b = 1;');
				assert.strictEqual(viewModel.viewCells[2].getText(), '# header a');
				assert.strictEqual(viewModel.viewCells[3].getText(), 'var b = 1;');
			});
	});
});

