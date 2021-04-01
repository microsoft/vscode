/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { Range } from 'vs/editor/common/core/range';
import { ResourceNotebookCellEdit } from 'vs/workbench/contrib/bulkEdit/browser/bulkCellEdits';
import { copyCellRange, joinNotebookCells, moveCellRange } from 'vs/workbench/contrib/notebook/browser/contrib/cellOperations/cellOperations';
import { FoldingModel, updateFoldingStateAtIndex } from 'vs/workbench/contrib/notebook/browser/contrib/fold/foldingModel';
import { CellEditType, CellKind, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
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

	test('Copy/duplicate cells - target and selection are different, #119769', async function () {
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
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] });
				await copyCellRange({ notebookEditor: editor, cell: viewModel.viewCells[1], ui: true }, 'down');
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

	test('Join cell with below - single cell', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markdown, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markdown, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, accessor) => {
				const viewModel = editor.viewModel;
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 3, end: 4 }, selections: [{ start: 3, end: 4 }] });
				const ret = await joinNotebookCells(editor.viewModel, { start: 3, end: 4 }, 'below');
				assert.strictEqual(ret?.edits.length, 2);
				assert.deepStrictEqual(ret?.edits[0], new ResourceTextEdit(viewModel.viewCells[3].uri, {
					range: new Range(1, 11, 1, 11), text: viewModel.viewCells[4].textBuffer.getEOL() + 'var c = 3;'
				}));
				assert.deepStrictEqual(ret?.edits[1], new ResourceNotebookCellEdit(viewModel.notebookDocument.uri,
					{
						editType: CellEditType.Replace,
						index: 4,
						count: 1,
						cells: []
					}
				));
			});
	});

	test('Join cell with above - single cell', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markdown, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markdown, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, accessor) => {
				const viewModel = editor.viewModel;
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 3, end: 4 }, selections: [{ start: 3, end: 4 }] });
				const ret = await joinNotebookCells(editor.viewModel, { start: 4, end: 5 }, 'above');
				assert.strictEqual(ret?.edits.length, 2);
				assert.deepStrictEqual(ret?.edits[0], new ResourceTextEdit(viewModel.viewCells[3].uri, {
					range: new Range(1, 11, 1, 11), text: viewModel.viewCells[4].textBuffer.getEOL() + 'var c = 3;'
				}));
				assert.deepStrictEqual(ret?.edits[1], new ResourceNotebookCellEdit(viewModel.notebookDocument.uri,
					{
						editType: CellEditType.Replace,
						index: 4,
						count: 1,
						cells: []
					}
				));
			});
	});

	test('Join cell with below - multiple cells', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, accessor) => {
				const viewModel = editor.viewModel;
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 0, end: 2 }] });
				const ret = await joinNotebookCells(editor.viewModel, { start: 0, end: 2 }, 'below');
				assert.strictEqual(ret?.edits.length, 2);
				assert.deepStrictEqual(ret?.edits[0], new ResourceTextEdit(viewModel.viewCells[0].uri, {
					range: new Range(1, 11, 1, 11), text: viewModel.viewCells[1].textBuffer.getEOL() + 'var b = 2;' + viewModel.viewCells[2].textBuffer.getEOL() + 'var c = 3;'
				}));
				assert.deepStrictEqual(ret?.edits[1], new ResourceNotebookCellEdit(viewModel.notebookDocument.uri,
					{
						editType: CellEditType.Replace,
						index: 1,
						count: 2,
						cells: []
					}
				));
			});
	});

	test('Join cell with above - multiple cells', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, accessor) => {
				const viewModel = editor.viewModel;
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 2, end: 3 }, selections: [{ start: 1, end: 3 }] });
				const ret = await joinNotebookCells(editor.viewModel, { start: 1, end: 3 }, 'above');
				assert.strictEqual(ret?.edits.length, 2);
				assert.deepStrictEqual(ret?.edits[0], new ResourceTextEdit(viewModel.viewCells[0].uri, {
					range: new Range(1, 11, 1, 11), text: viewModel.viewCells[1].textBuffer.getEOL() + 'var b = 2;' + viewModel.viewCells[2].textBuffer.getEOL() + 'var c = 3;'
				}));
				assert.deepStrictEqual(ret?.edits[1], new ResourceNotebookCellEdit(viewModel.notebookDocument.uri,
					{
						editType: CellEditType.Replace,
						index: 1,
						count: 2,
						cells: []
					}
				));
			});
	});
});

