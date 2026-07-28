/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { FoldingModel, updateFoldingStateAtIndex } from '../../browser/viewModel/foldingModel.js';
import { runDeleteAction } from '../../browser/controller/cellOperations.js';
import { NotebookCellSelectionCollection } from '../../browser/viewModel/cellSelectionCollection.js';
import { CellEditType, CellKind, SelectionStateType } from '../../common/notebookCommon.js';
import { createNotebookCellList, setupInstantiationService, TestCell, withTestNotebook } from './testNotebookEditor.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';

suite('NotebookSelection', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('focus is never empty', function () {
		const selectionCollection = new NotebookCellSelectionCollection();
		assert.deepStrictEqual(selectionCollection.focus, { start: 0, end: 0 });

		selectionCollection.setState(null, [], true, 'model');
		assert.deepStrictEqual(selectionCollection.focus, { start: 0, end: 0 });
		selectionCollection.dispose();
	});

	test('selection is never empty', function () {
		const selectionCollection = new NotebookCellSelectionCollection();
		assert.deepStrictEqual(selectionCollection.selections, [{ start: 0, end: 0 }]);

		selectionCollection.setState(null, [], true, 'model');
		assert.deepStrictEqual(selectionCollection.selections, [{ start: 0, end: 0 }]);
		selectionCollection.dispose();
	});

	test('selections does not change when setting to empty', function () {
		const selectionCollection = new NotebookCellSelectionCollection();
		let changed = false;
		store.add(selectionCollection.onDidChangeSelection(() => {
			changed = true;
		}));

		selectionCollection.setState(null, [], false, 'model');
		assert.strictEqual(changed, false);
		selectionCollection.setState({ start: 0, end: 0 }, [], false, 'model');
		assert.strictEqual(changed, false);
		selectionCollection.setState({ start: 0, end: 0 }, [{ start: 0, end: 0 }], false, 'model');
		assert.strictEqual(changed, false);
		selectionCollection.setState(null, [], false, 'model');
		assert.strictEqual(changed, false);
		selectionCollection.dispose();
	});

	test('event fires when selection or focus changes', function () {
		const selectionCollection = new NotebookCellSelectionCollection();
		let eventCount = 0;
		store.add(selectionCollection.onDidChangeSelection(() => {
			eventCount++;
		}));

		// Change focus
		selectionCollection.setState({ start: 1, end: 1 }, [{ start: 1, end: 2 }], false, 'model');
		assert.strictEqual(eventCount, 1);

		// Change selections
		selectionCollection.setState({ start: 1, end: 1 }, [{ start: 1, end: 2 }, { start: 2, end: 3 }], false, 'model');
		assert.strictEqual(eventCount, 2);

		// no change
		selectionCollection.setState({ start: 1, end: 1 }, [{ start: 1, end: 2 }, { start: 2, end: 3 }], false, 'model');
		assert.strictEqual(eventCount, 2);

		// change to empty focus
		selectionCollection.setState({ start: 0, end: 0 }, [{ start: 4, end: 5 }], false, 'model');
		assert.strictEqual(eventCount, 3);

		// change to empty selections
		selectionCollection.setState({ start: 0, end: 0 }, [], false, 'model');
		assert.strictEqual(eventCount, 4);

		selectionCollection.dispose();
	});

});

suite('NotebookCellList focus/selection', () => {
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let languageService: ILanguageService;

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = setupInstantiationService(disposables);
		languageService = instantiationService.get(ILanguageService);
	});


	test('notebook cell list setFocus', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}]
			],
			(editor, viewModel, ds) => {
				const cellList = createNotebookCellList(instantiationService, ds);
				cellList.attachViewModel(viewModel);

				assert.strictEqual(cellList.length, 2);
				cellList.setFocus([0]);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });

				cellList.setFocus([1]);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });
				cellList.detachViewModel();
			});
	});

	test('notebook cell list setSelections', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}]
			],
			(editor, viewModel, ds) => {
				const cellList = createNotebookCellList(instantiationService, ds);
				cellList.attachViewModel(viewModel);

				assert.strictEqual(cellList.length, 2);
				cellList.setSelection([0]);
				// the only selection is also the focus
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 1 }]);

				// set selection does not modify focus
				cellList.setSelection([1]);
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 2 }]);
			});
	});

	test('notebook cell list setFocus2', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}]
			],
			(editor, viewModel, ds) => {
				const cellList = createNotebookCellList(instantiationService, ds);
				cellList.attachViewModel(viewModel);

				assert.strictEqual(cellList.length, 2);
				cellList.setFocus([0]);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });

				cellList.setFocus([1]);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });

				cellList.setSelection([1]);
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 2 }]);
				cellList.detachViewModel();
			});
	});


	test('notebook cell list focus/selection from UI', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['# header c', 'markdown', CellKind.Markup, [], {}]
			],
			(editor, viewModel, ds) => {
				const cellList = createNotebookCellList(instantiationService, ds);
				cellList.attachViewModel(viewModel);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 1 }]);

				// arrow down, move both focus and selections
				cellList.setFocus([1], new KeyboardEvent('keydown'), undefined);
				cellList.setSelection([1], new KeyboardEvent('keydown'), undefined);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 2 }]);

				// shift+arrow down, expands selection
				cellList.setFocus([2], new KeyboardEvent('keydown'), undefined);
				cellList.setSelection([1, 2]);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 3 }]);

				// arrow down, will move focus but not expand selection
				cellList.setFocus([3], new KeyboardEvent('keydown'), undefined);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 3, end: 4 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 3 }]);
			});
	});


	test('notebook cell list focus/selection with folding regions', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['# header c', 'markdown', CellKind.Markup, [], {}]
			],
			(editor, viewModel, ds) => {
				const foldingModel = ds.add(new FoldingModel());
				foldingModel.attachViewModel(viewModel);

				const cellList = createNotebookCellList(instantiationService, ds);
				cellList.attachViewModel(viewModel);
				assert.strictEqual(cellList.length, 5);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 1 }]);
				cellList.setFocus([0]);

				updateFoldingStateAtIndex(foldingModel, 0, true);
				updateFoldingStateAtIndex(foldingModel, 2, true);
				viewModel.updateFoldingRanges(foldingModel.regions);
				cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
				assert.strictEqual(cellList.length, 3);

				// currently, focus on a folded cell will only focus the cell itself, excluding its "inner" cells
				assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 1 }]);

				cellList.focusNext(1, false);
				// focus next should skip the folded items
				assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 1 }]);

				// unfold
				updateFoldingStateAtIndex(foldingModel, 2, false);
				viewModel.updateFoldingRanges(foldingModel.regions);
				cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
				assert.strictEqual(cellList.length, 4);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
			});
	});

	test('notebook cell list focus/selection with folding regions and applyEdits', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3', 'javascript', CellKind.Markup, [], {}],
				['# header d', 'markdown', CellKind.Markup, [], {}],
				['var e = 4;', 'javascript', CellKind.Code, [], {}],
			],
			(editor, viewModel, ds) => {
				const foldingModel = ds.add(new FoldingModel());
				foldingModel.attachViewModel(viewModel);

				const cellList = createNotebookCellList(instantiationService, ds);
				cellList.attachViewModel(viewModel);
				cellList.setFocus([0]);
				cellList.setSelection([0]);

				updateFoldingStateAtIndex(foldingModel, 0, true);
				updateFoldingStateAtIndex(foldingModel, 2, true);
				viewModel.updateFoldingRanges(foldingModel.regions);
				cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
				assert.strictEqual(cellList.getModelIndex2(0), 0);
				assert.strictEqual(cellList.getModelIndex2(1), 2);

				editor.textModel.applyEdits([{
					editType: CellEditType.Replace, index: 0, count: 2, cells: []
				}], true, undefined, () => undefined, undefined, false);
				viewModel.updateFoldingRanges(foldingModel.regions);
				cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);

				assert.strictEqual(cellList.getModelIndex2(0), 0);
				assert.strictEqual(cellList.getModelIndex2(1), 3);

				// mimic undo
				editor.textModel.applyEdits([{
					editType: CellEditType.Replace, index: 0, count: 0, cells: [
						ds.add(new TestCell(viewModel.viewType, 7, '# header f', 'markdown', CellKind.Code, [], languageService)),
						ds.add(new TestCell(viewModel.viewType, 8, 'var g = 5;', 'javascript', CellKind.Code, [], languageService))
					]
				}], true, undefined, () => undefined, undefined, false);
				viewModel.updateFoldingRanges(foldingModel.regions);
				cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
				assert.strictEqual(cellList.getModelIndex2(0), 0);
				assert.strictEqual(cellList.getModelIndex2(1), 1);
				assert.strictEqual(cellList.getModelIndex2(2), 2);
			});
	});

	test('notebook cell list getModelIndex', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['# header c', 'markdown', CellKind.Markup, [], {}]
			],
			(editor, viewModel, ds) => {
				const foldingModel = ds.add(new FoldingModel());
				foldingModel.attachViewModel(viewModel);

				const cellList = createNotebookCellList(instantiationService, ds);
				cellList.attachViewModel(viewModel);

				updateFoldingStateAtIndex(foldingModel, 0, true);
				updateFoldingStateAtIndex(foldingModel, 2, true);
				viewModel.updateFoldingRanges(foldingModel.regions);
				cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);

				assert.deepStrictEqual(cellList.getModelIndex2(-1), 0);
				assert.deepStrictEqual(cellList.getModelIndex2(0), 0);
				assert.deepStrictEqual(cellList.getModelIndex2(1), 2);
				assert.deepStrictEqual(cellList.getModelIndex2(2), 4);
			});
	});


	test('notebook validate range', async () => {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}]
			],
			(editor, viewModel) => {
				assert.deepStrictEqual(viewModel.validateRange(null), null);
				assert.deepStrictEqual(viewModel.validateRange(undefined), null);
				assert.deepStrictEqual(viewModel.validateRange({ start: 0, end: 0 }), { start: 0, end: 0 });
				assert.deepStrictEqual(viewModel.validateRange({ start: 0, end: 2 }), { start: 0, end: 2 });
				assert.deepStrictEqual(viewModel.validateRange({ start: 0, end: 3 }), { start: 0, end: 2 });
				assert.deepStrictEqual(viewModel.validateRange({ start: -1, end: 3 }), { start: 0, end: 2 });
				assert.deepStrictEqual(viewModel.validateRange({ start: -1, end: 1 }), { start: 0, end: 1 });
				assert.deepStrictEqual(viewModel.validateRange({ start: 2, end: 1 }), { start: 1, end: 2 });
				assert.deepStrictEqual(viewModel.validateRange({ start: 2, end: -1 }), { start: 0, end: 2 });
			});
	});

	test('notebook updateSelectionState', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}]
			],
			(editor, viewModel) => {
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }, { start: -1, end: 0 }] });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 2 }]);
			});
	});

	test('notebook cell selection w/ cell deletion', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}]
			],
			(editor, viewModel) => {
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
				runDeleteAction(editor, viewModel.cellAt(1)!);
				// viewModel.deleteCell(1, true, false);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 1 }]);
				runDeleteAction(editor, viewModel.cellAt(0)!);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 0 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 0 }]);
			});
	});

	test('notebook cell selection w/ cell deletion from applyEdits', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['var c = 2;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
				editor.textModel.applyEdits([{
					editType: CellEditType.Replace,
					index: 1,
					count: 1,
					cells: []
				}], true, undefined, () => undefined, undefined, true);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 2 }]);
			});
	});
});
