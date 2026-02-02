/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { setupInstantiationService, withTestNotebook } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { FoldingModel, updateFoldingStateAtIndex } from 'vs/workbench/contrib/notebook/browser/viewModel/foldingModel';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('Notebook Folding', () => {
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;

	teardown(() => disposables.dispose());

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = setupInstantiationService(disposables);
		instantiationService.spy(IUndoRedoService, 'pushElement');
	});


	test('Folding based on markdown cells', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
				['## header 2.1', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
			],
			(editor, viewModel, ds) => {
				const foldingController = ds.add(new FoldingModel());
				foldingController.attachViewModel(viewModel);

				assert.strictEqual(foldingController.regions.findRange(1), 0);
				assert.strictEqual(foldingController.regions.findRange(2), 0);
				assert.strictEqual(foldingController.regions.findRange(3), 1);
				assert.strictEqual(foldingController.regions.findRange(4), 1);
				assert.strictEqual(foldingController.regions.findRange(5), 1);
				assert.strictEqual(foldingController.regions.findRange(6), 2);
				assert.strictEqual(foldingController.regions.findRange(7), 2);
			}
		);
	});

	test('Folding not based on code cells', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
				['# comment 1', 'python', CellKind.Code, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3\n```\n## comment 2\n```', 'markdown', CellKind.Markup, [], {}],
				['body 4', 'markdown', CellKind.Markup, [], {}],
				['## header 2.1', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'python', CellKind.Code, [], {}],
			],
			(editor, viewModel, ds) => {
				const foldingController = ds.add(new FoldingModel());
				foldingController.attachViewModel(viewModel);

				assert.strictEqual(foldingController.regions.findRange(1), 0);
				assert.strictEqual(foldingController.regions.findRange(2), 0);
				assert.strictEqual(foldingController.regions.findRange(3), 0);
				assert.strictEqual(foldingController.regions.findRange(4), 0);
				assert.strictEqual(foldingController.regions.findRange(5), 0);
				assert.strictEqual(foldingController.regions.findRange(6), 0);
				assert.strictEqual(foldingController.regions.findRange(7), 1);
				assert.strictEqual(foldingController.regions.findRange(8), 1);
			}
		);
	});

	test('Top level header in a cell wins', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
				['## header 2.1\n# header3', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
			],
			(editor, viewModel, ds) => {
				const foldingController = ds.add(new FoldingModel());
				foldingController.attachViewModel(viewModel);

				assert.strictEqual(foldingController.regions.findRange(1), 0);
				assert.strictEqual(foldingController.regions.findRange(2), 0);
				assert.strictEqual(foldingController.regions.getEndLineNumber(0), 2);

				assert.strictEqual(foldingController.regions.findRange(3), 1);
				assert.strictEqual(foldingController.regions.findRange(4), 1);
				assert.strictEqual(foldingController.regions.findRange(5), 1);
				assert.strictEqual(foldingController.regions.getEndLineNumber(1), 7);

				assert.strictEqual(foldingController.regions.findRange(6), 2);
				assert.strictEqual(foldingController.regions.findRange(7), 2);
				assert.strictEqual(foldingController.regions.getEndLineNumber(2), 7);
			}
		);
	});

	test('Folding', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
				['## header 2.1', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
			],
			(editor, viewModel, ds) => {
				const foldingModel = ds.add(new FoldingModel());
				foldingModel.attachViewModel(viewModel);
				updateFoldingStateAtIndex(foldingModel, 0, true);
				viewModel.updateFoldingRanges(foldingModel.regions);
				assert.deepStrictEqual(viewModel.getHiddenRanges(), [
					{ start: 1, end: 6 }
				]);
			}
		);

		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
				['## header 2.1\n', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
			],
			(editor, viewModel, ds) => {
				const foldingModel = ds.add(new FoldingModel());
				foldingModel.attachViewModel(viewModel);
				updateFoldingStateAtIndex(foldingModel, 2, true);
				viewModel.updateFoldingRanges(foldingModel.regions);

				assert.deepStrictEqual(viewModel.getHiddenRanges(), [
					{ start: 3, end: 4 }
				]);
			}
		);

		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
				['# header 2.1\n', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
			],
			(editor, viewModel, ds) => {
				const foldingModel = ds.add(new FoldingModel());
				foldingModel.attachViewModel(viewModel);
				updateFoldingStateAtIndex(foldingModel, 2, true);
				viewModel.updateFoldingRanges(foldingModel.regions);

				assert.deepStrictEqual(viewModel.getHiddenRanges(), [
					{ start: 3, end: 6 }
				]);
			}
		);
	});

	test('Nested Folding', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
				['# header 2.1\n', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
			],
			(editor, viewModel, ds) => {
				const foldingModel = ds.add(new FoldingModel());
				foldingModel.attachViewModel(viewModel);
				updateFoldingStateAtIndex(foldingModel, 0, true);
				viewModel.updateFoldingRanges(foldingModel.regions);

				assert.deepStrictEqual(viewModel.getHiddenRanges(), [
					{ start: 1, end: 1 }
				]);

				updateFoldingStateAtIndex(foldingModel, 5, true);
				updateFoldingStateAtIndex(foldingModel, 2, true);
				viewModel.updateFoldingRanges(foldingModel.regions);

				assert.deepStrictEqual(viewModel.getHiddenRanges(), [
					{ start: 1, end: 1 },
					{ start: 3, end: 6 }
				]);

				updateFoldingStateAtIndex(foldingModel, 2, false);
				viewModel.updateFoldingRanges(foldingModel.regions);
				assert.deepStrictEqual(viewModel.getHiddenRanges(), [
					{ start: 1, end: 1 },
					{ start: 6, end: 6 }
				]);

				// viewModel.insertCell(7, new TestCell(viewModel.viewType, 7, ['var c = 8;'], 'markdown', CellKind.Code, []), true);

				// assert.deepStrictEqual(viewModel.getHiddenRanges(), [
				// 	{ start: 1, end: 1 },
				// 	{ start: 6, end: 7 }
				// ]);

				// viewModel.insertCell(1, new TestCell(viewModel.viewType, 8, ['var c = 9;'], 'markdown', CellKind.Code, []), true);
				// assert.deepStrictEqual(viewModel.getHiddenRanges(), [
				// 	// the first collapsed range is now expanded as we insert content into it.
				// 	// { start: 1,},
				// 	{ start: 7, end: 8 }
				// ]);
			}
		);
	});

	test('Folding Memento', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
				['# header 2.1\n', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
				['# header 2.1\n', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
			],
			(editor, viewModel, ds) => {
				const foldingModel = ds.add(new FoldingModel());
				foldingModel.attachViewModel(viewModel);
				foldingModel.applyMemento([{ start: 2, end: 6 }]);
				viewModel.updateFoldingRanges(foldingModel.regions);

				// Note that hidden ranges !== folding ranges
				assert.deepStrictEqual(viewModel.getHiddenRanges(), [
					{ start: 3, end: 6 }
				]);
			}
		);

		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
				['# header 2.1\n', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
				['# header 2.1\n', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
			],
			(editor, viewModel, ds) => {
				const foldingModel = ds.add(new FoldingModel());
				foldingModel.attachViewModel(viewModel);
				foldingModel.applyMemento([
					{ start: 5, end: 6 },
					{ start: 10, end: 11 },
				]);
				viewModel.updateFoldingRanges(foldingModel.regions);

				// Note that hidden ranges !== folding ranges
				assert.deepStrictEqual(viewModel.getHiddenRanges(), [
					{ start: 6, end: 6 },
					{ start: 11, end: 11 }
				]);
			}
		);

		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
				['# header 2.1\n', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
				['# header 2.1\n', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
			],
			(editor, viewModel, ds) => {
				const foldingModel = ds.add(new FoldingModel());
				foldingModel.attachViewModel(viewModel);
				foldingModel.applyMemento([
					{ start: 5, end: 6 },
					{ start: 7, end: 11 },
				]);
				viewModel.updateFoldingRanges(foldingModel.regions);

				// Note that hidden ranges !== folding ranges
				assert.deepStrictEqual(viewModel.getHiddenRanges(), [
					{ start: 6, end: 6 },
					{ start: 8, end: 11 }
				]);
			}
		);
	});

	test('View Index', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
				['# header 2.1\n', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
				['# header 2.1\n', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
			],
			(editor, viewModel, ds) => {
				const foldingModel = ds.add(new FoldingModel());
				foldingModel.attachViewModel(viewModel);
				foldingModel.applyMemento([{ start: 2, end: 6 }]);
				viewModel.updateFoldingRanges(foldingModel.regions);

				// Note that hidden ranges !== folding ranges
				assert.deepStrictEqual(viewModel.getHiddenRanges(), [
					{ start: 3, end: 6 }
				]);

				assert.strictEqual(viewModel.getNextVisibleCellIndex(1), 2);
				assert.strictEqual(viewModel.getNextVisibleCellIndex(2), 7);
				assert.strictEqual(viewModel.getNextVisibleCellIndex(3), 7);
				assert.strictEqual(viewModel.getNextVisibleCellIndex(4), 7);
				assert.strictEqual(viewModel.getNextVisibleCellIndex(5), 7);
				assert.strictEqual(viewModel.getNextVisibleCellIndex(6), 7);
				assert.strictEqual(viewModel.getNextVisibleCellIndex(7), 8);
			}
		);

		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['body', 'markdown', CellKind.Markup, [], {}],
				['# header 2.1\n', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
				['# header 2.1\n', 'markdown', CellKind.Markup, [], {}],
				['body 2', 'markdown', CellKind.Markup, [], {}],
				['body 3', 'markdown', CellKind.Markup, [], {}],
				['## header 2.2', 'markdown', CellKind.Markup, [], {}],
				['var e = 7;', 'markdown', CellKind.Markup, [], {}],
			],
			(editor, viewModel, ds) => {
				const foldingModel = ds.add(new FoldingModel());
				foldingModel.attachViewModel(viewModel);
				foldingModel.applyMemento([
					{ start: 5, end: 6 },
					{ start: 10, end: 11 },
				]);

				viewModel.updateFoldingRanges(foldingModel.regions);

				// Note that hidden ranges !== folding ranges
				assert.deepStrictEqual(viewModel.getHiddenRanges(), [
					{ start: 6, end: 6 },
					{ start: 11, end: 11 }
				]);

				// folding ranges
				// [5, 6]
				// [10, 11]
				assert.strictEqual(viewModel.getNextVisibleCellIndex(4), 5);
				assert.strictEqual(viewModel.getNextVisibleCellIndex(5), 7);
				assert.strictEqual(viewModel.getNextVisibleCellIndex(6), 7);

				assert.strictEqual(viewModel.getNextVisibleCellIndex(9), 10);
				assert.strictEqual(viewModel.getNextVisibleCellIndex(10), 12);
				assert.strictEqual(viewModel.getNextVisibleCellIndex(11), 12);
			}
		);
	});
});
