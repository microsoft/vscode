/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { FoldingModel, updateFoldingStateAtIndex } from '../../browser/viewModel/foldingModel.js';
import { changeCellToKind, computeCellLinesContents, copyCellRange, insertCell, joinNotebookCells, moveCellRange, runDeleteAction } from '../../browser/controller/cellOperations.js';
import { CellEditType, CellKind, SelectionStateType } from '../../common/notebookCommon.js';
import { withTestNotebook } from './testNotebookEditor.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { ResourceNotebookCellEdit } from '../../../bulkEdit/browser/bulkCellEdits.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextBuffer, ValidAnnotatedEditOperation } from '../../../../../editor/common/model.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('CellOperations', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Move cells - single cell', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
				const cell = viewModel.cellAt(1);
				assert.ok(cell);
				await moveCellRange({ notebookEditor: editor, cell: cell }, 'down');
				assert.strictEqual(viewModel.cellAt(2)?.getText(), 'var b = 1;');
				assert.strictEqual(cell, viewModel.cellAt(2));
			});
	});

	test('Move cells - multiple cells in a selection', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 0, end: 2 }] });
				await moveCellRange({ notebookEditor: editor }, 'down');
				assert.strictEqual(viewModel.cellAt(0)?.getText(), '# header b');
				assert.strictEqual(viewModel.cellAt(1)?.getText(), '# header a');
				assert.strictEqual(viewModel.cellAt(2)?.getText(), 'var b = 1;');
			});
	});

	test('Move cells - move with folding ranges', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel, ds) => {
				const foldingModel = ds.add(new FoldingModel());
				foldingModel.attachViewModel(viewModel);
				updateFoldingStateAtIndex(foldingModel, 0, true);
				updateFoldingStateAtIndex(foldingModel, 1, true);
				viewModel.updateFoldingRanges(foldingModel.regions);
				editor.setHiddenAreas([{ start: 1, end: 2 }]);
				editor.setHiddenAreas(viewModel.getHiddenRanges());

				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] });
				await moveCellRange({ notebookEditor: editor }, 'down');
				assert.strictEqual(viewModel.cellAt(0)?.getText(), '# header b');
				assert.strictEqual(viewModel.cellAt(1)?.getText(), '# header a');
				assert.strictEqual(viewModel.cellAt(2)?.getText(), 'var b = 1;');
			});
	});


	test('Copy/duplicate cells - single cell', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
				await copyCellRange({ notebookEditor: editor, cell: viewModel.cellAt(1)! }, 'down');
				assert.strictEqual(viewModel.length, 6);
				assert.strictEqual(viewModel.cellAt(1)?.getText(), 'var b = 1;');
				assert.strictEqual(viewModel.cellAt(2)?.getText(), 'var b = 1;');
			});
	});

	test('Copy/duplicate cells - target and selection are different, #119769', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] });
				await copyCellRange({ notebookEditor: editor, cell: viewModel.cellAt(1)!, ui: true }, 'down');
				assert.strictEqual(viewModel.length, 6);
				assert.strictEqual(viewModel.cellAt(1)?.getText(), 'var b = 1;');
				assert.strictEqual(viewModel.cellAt(2)?.getText(), 'var b = 1;');
			});
	});

	test('Copy/duplicate cells - multiple cells in a selection', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 0, end: 2 }] });
				await copyCellRange({ notebookEditor: editor, cell: viewModel.cellAt(1)! }, 'down');
				assert.strictEqual(viewModel.length, 7);
				assert.strictEqual(viewModel.cellAt(0)?.getText(), '# header a');
				assert.strictEqual(viewModel.cellAt(1)?.getText(), 'var b = 1;');
				assert.strictEqual(viewModel.cellAt(2)?.getText(), '# header a');
				assert.strictEqual(viewModel.cellAt(3)?.getText(), 'var b = 1;');
			});
	});

	test('Copy/duplicate cells - move with folding ranges', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel, ds) => {
				const foldingModel = ds.add(new FoldingModel());
				foldingModel.attachViewModel(viewModel);
				updateFoldingStateAtIndex(foldingModel, 0, true);
				updateFoldingStateAtIndex(foldingModel, 1, true);
				viewModel.updateFoldingRanges(foldingModel.regions);
				editor.setHiddenAreas([{ start: 1, end: 2 }]);
				editor.setHiddenAreas(viewModel.getHiddenRanges());

				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] });
				await copyCellRange({ notebookEditor: editor, cell: viewModel.cellAt(1)! }, 'down');
				assert.strictEqual(viewModel.length, 7);
				assert.strictEqual(viewModel.cellAt(0)?.getText(), '# header a');
				assert.strictEqual(viewModel.cellAt(1)?.getText(), 'var b = 1;');
				assert.strictEqual(viewModel.cellAt(2)?.getText(), '# header a');
				assert.strictEqual(viewModel.cellAt(3)?.getText(), 'var b = 1;');
			});
	});

	test('Copy/duplicate cells - should not share the same text buffer #102423', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
				await copyCellRange({ notebookEditor: editor, cell: viewModel.cellAt(1)! }, 'down');
				assert.strictEqual(viewModel.length, 3);
				const cell1 = viewModel.cellAt(1);
				const cell2 = viewModel.cellAt(2);
				assert.ok(cell1);
				assert.ok(cell2);
				assert.strictEqual(cell1.getText(), 'var b = 1;');
				assert.strictEqual(viewModel.cellAt(2)?.getText(), 'var b = 1;');

				(cell1.textBuffer as ITextBuffer).applyEdits([
					new ValidAnnotatedEditOperation(null, new Range(1, 1, 1, 4), '', false, false, false)
				], false, true);
				assert.notStrictEqual(cell1.getText(), cell2.getText());
			});
	});

	test('Join cell with below - single cell', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel, accessor) => {
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 3, end: 4 }, selections: [{ start: 3, end: 4 }] });
				const ret = await joinNotebookCells(editor, { start: 3, end: 4 }, 'below');
				assert.strictEqual(ret?.edits.length, 2);
				assert.deepStrictEqual(ret?.edits[0], new ResourceTextEdit(viewModel.cellAt(3)!.uri, {
					range: new Range(1, 11, 1, 11), text: viewModel.cellAt(4)!.textBuffer.getEOL() + 'var c = 3;'
				}));
				assert.deepStrictEqual(ret?.edits[1], new ResourceNotebookCellEdit(editor.textModel.uri,
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
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel, accessor) => {
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 3, end: 4 }, selections: [{ start: 3, end: 4 }] });
				const ret = await joinNotebookCells(editor, { start: 4, end: 5 }, 'above');
				assert.strictEqual(ret?.edits.length, 2);
				assert.deepStrictEqual(ret?.edits[0], new ResourceTextEdit(viewModel.cellAt(3)!.uri, {
					range: new Range(1, 11, 1, 11), text: viewModel.cellAt(4)!.textBuffer.getEOL() + 'var c = 3;'
				}));
				assert.deepStrictEqual(ret?.edits[1], new ResourceNotebookCellEdit(editor.textModel.uri,
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
			async (editor, viewModel, accessor) => {
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 0, end: 2 }] });
				const ret = await joinNotebookCells(editor, { start: 0, end: 2 }, 'below');
				assert.strictEqual(ret?.edits.length, 2);
				assert.deepStrictEqual(ret?.edits[0], new ResourceTextEdit(viewModel.cellAt(0)!.uri, {
					range: new Range(1, 11, 1, 11), text: viewModel.cellAt(1)!.textBuffer.getEOL() + 'var b = 2;' + viewModel.cellAt(2)!.textBuffer.getEOL() + 'var c = 3;'
				}));
				assert.deepStrictEqual(ret?.edits[1], new ResourceNotebookCellEdit(editor.textModel.uri,
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
			async (editor, viewModel, accessor) => {
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 2, end: 3 }, selections: [{ start: 1, end: 3 }] });
				const ret = await joinNotebookCells(editor, { start: 1, end: 3 }, 'above');
				assert.strictEqual(ret?.edits.length, 2);
				assert.deepStrictEqual(ret?.edits[0], new ResourceTextEdit(viewModel.cellAt(0)!.uri, {
					range: new Range(1, 11, 1, 11), text: viewModel.cellAt(1)!.textBuffer.getEOL() + 'var b = 2;' + viewModel.cellAt(2)!.textBuffer.getEOL() + 'var c = 3;'
				}));
				assert.deepStrictEqual(ret?.edits[1], new ResourceNotebookCellEdit(editor.textModel.uri,
					{
						editType: CellEditType.Replace,
						index: 1,
						count: 2,
						cells: []
					}
				));
			});
	});

	test('Delete focus cell', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				editor.setFocus({ start: 0, end: 1 });
				editor.setSelections([{ start: 0, end: 1 }]);
				runDeleteAction(editor, viewModel.cellAt(0)!);
				assert.strictEqual(viewModel.length, 2);
			});
	});

	test('Delete selected cells', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				editor.setFocus({ start: 0, end: 1 });
				editor.setSelections([{ start: 0, end: 2 }]);
				runDeleteAction(editor, viewModel.cellAt(0)!);
				assert.strictEqual(viewModel.length, 1);
			});
	});

	test('Delete focus cell out of a selection', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}],
				['var d = 4;', 'javascript', CellKind.Code, [], {}],
			],
			async (editor, viewModel) => {
				editor.setFocus({ start: 0, end: 1 });
				editor.setSelections([{ start: 2, end: 4 }]);
				runDeleteAction(editor, viewModel.cellAt(0)!);
				assert.strictEqual(viewModel.length, 3);
			});
	});

	test('Delete UI target', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				editor.setFocus({ start: 0, end: 1 });
				editor.setSelections([{ start: 0, end: 1 }]);
				runDeleteAction(editor, viewModel.cellAt(2)!);
				assert.strictEqual(viewModel.length, 2);
				assert.strictEqual(viewModel.cellAt(0)?.getText(), 'var a = 1;');
				assert.strictEqual(viewModel.cellAt(1)?.getText(), 'var b = 2;');
			});
	});

	test('Delete UI target 2', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}],
				['var d = 4;', 'javascript', CellKind.Code, [], {}],
				['var e = 5;', 'javascript', CellKind.Code, [], {}],
			],
			async (editor, viewModel) => {
				editor.setFocus({ start: 0, end: 1 });
				editor.setSelections([{ start: 0, end: 1 }, { start: 3, end: 5 }]);
				runDeleteAction(editor, viewModel.cellAt(1)!);
				assert.strictEqual(viewModel.length, 4);
				assert.deepStrictEqual(editor.getFocus(), { start: 0, end: 1 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 1 }, { start: 2, end: 4 }]);
			});
	});

	test('Delete UI target 3', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}],
				['var d = 4;', 'javascript', CellKind.Code, [], {}],
				['var e = 5;', 'javascript', CellKind.Code, [], {}],
			],
			async (editor, viewModel) => {
				editor.setFocus({ start: 0, end: 1 });
				editor.setSelections([{ start: 2, end: 3 }]);
				runDeleteAction(editor, viewModel.cellAt(0)!);
				assert.strictEqual(viewModel.length, 4);
				assert.deepStrictEqual(editor.getFocus(), { start: 0, end: 1 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 2 }]);
			});
	});

	test('Delete UI target 4', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}],
				['var d = 4;', 'javascript', CellKind.Code, [], {}],
				['var e = 5;', 'javascript', CellKind.Code, [], {}],
			],
			async (editor, viewModel) => {
				editor.setFocus({ start: 2, end: 3 });
				editor.setSelections([{ start: 3, end: 5 }]);
				runDeleteAction(editor, viewModel.cellAt(0)!);
				assert.strictEqual(viewModel.length, 4);
				assert.deepStrictEqual(editor.getFocus(), { start: 1, end: 2 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 2, end: 4 }]);
			});
	});


	test('Delete last cell sets selection correctly', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				editor.setFocus({ start: 2, end: 3 });
				editor.setSelections([{ start: 2, end: 3 }]);
				runDeleteAction(editor, viewModel.cellAt(2)!);
				assert.strictEqual(viewModel.length, 2);
				assert.deepStrictEqual(editor.getFocus(), { start: 1, end: 2 });
			});
	});

	test('#120187. Delete should work on multiple distinct selection', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}],
				['var d = 4;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				editor.setFocus({ start: 0, end: 1 });
				editor.setSelections([{ start: 0, end: 1 }, { start: 3, end: 4 }]);
				runDeleteAction(editor, viewModel.cellAt(0)!);
				assert.strictEqual(viewModel.length, 2);
				assert.deepStrictEqual(editor.getFocus(), { start: 0, end: 1 });
			});
	});

	test('#120187. Delete should work on multiple distinct selection 2', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}],
				['var d = 4;', 'javascript', CellKind.Code, [], {}],
				['var e = 5;', 'javascript', CellKind.Code, [], {}],
			],
			async (editor, viewModel) => {
				editor.setFocus({ start: 1, end: 2 });
				editor.setSelections([{ start: 1, end: 2 }, { start: 3, end: 5 }]);
				runDeleteAction(editor, viewModel.cellAt(1)!);
				assert.strictEqual(viewModel.length, 2);
				assert.deepStrictEqual(editor.getFocus(), { start: 1, end: 2 });
			});
	});

	test('Change cell kind - single cell', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
				await changeCellToKind(CellKind.Markup, { notebookEditor: editor, cell: viewModel.cellAt(1)!, ui: true });
				assert.strictEqual(viewModel.cellAt(1)?.cellKind, CellKind.Markup);
			});
	});

	test('Change cell kind - multi cells', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
				await changeCellToKind(CellKind.Markup, { notebookEditor: editor, selectedCells: [viewModel.cellAt(3)!, viewModel.cellAt(4)!], ui: false });
				assert.strictEqual(viewModel.cellAt(3)?.cellKind, CellKind.Markup);
				assert.strictEqual(viewModel.cellAt(4)?.cellKind, CellKind.Markup);
			});
	});


	test('split cell', async function () {
		await withTestNotebook(
			[
				['var b = 1;', 'javascript', CellKind.Code, [], {}]
			],
			(editor, viewModel) => {
				assert.deepStrictEqual(computeCellLinesContents(viewModel.cellAt(0)!, [{ lineNumber: 1, column: 4 }]), [
					'var',
					' b = 1;'
				]);

				assert.deepStrictEqual(computeCellLinesContents(viewModel.cellAt(0)!, [{ lineNumber: 1, column: 4 }, { lineNumber: 1, column: 6 }]), [
					'var',
					' b',
					' = 1;'
				]);

				assert.deepStrictEqual(computeCellLinesContents(viewModel.cellAt(0)!, [{ lineNumber: 1, column: 1 }]), [
					'',
					'var b = 1;'
				]);

				assert.deepStrictEqual(computeCellLinesContents(viewModel.cellAt(0)!, [{ lineNumber: 1, column: 11 }]), [
					'var b = 1;',
					'',
				]);
			}
		);
	});

	test('Insert cell', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel, _ds, accessor) => {
				const languageService = accessor.get(ILanguageService);

				const insertedCellAbove = insertCell(languageService, editor, 4, CellKind.Code, 'above', 'var a = 0;');
				assert.strictEqual(viewModel.length, 6);
				assert.strictEqual(viewModel.cellAt(4), insertedCellAbove);

				const insertedCellBelow = insertCell(languageService, editor, 1, CellKind.Code, 'below', 'var a = 0;');
				assert.strictEqual(viewModel.length, 7);
				assert.strictEqual(viewModel.cellAt(2), insertedCellBelow);
			});
	});
});
