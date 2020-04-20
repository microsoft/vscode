/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { withTestNotebook, TestCell } from 'vs/workbench/contrib/notebook/test/testNotebookEditor';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { FoldingModel, CellFoldingState } from 'vs/workbench/contrib/notebook/browser/viewModel/foldingModel';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';

suite('Notebook Folding', () => {
	const instantiationService = new TestInstantiationService();
	const blukEditService = instantiationService.get(IBulkEditService);
	const undoRedoService = instantiationService.stub(IUndoRedoService, () => { });
	instantiationService.spy(IUndoRedoService, 'pushElement');

	test('Folding based on markdown cells', function () {
		withTestNotebook(
			instantiationService,
			blukEditService,
			undoRedoService,
			[
				[['# header 1'], 'markdown', CellKind.Markdown, [], {}],
				[['body'], 'markdown', CellKind.Markdown, [], {}],
				[['## header 2.1'], 'markdown', CellKind.Markdown, [], {}],
				[['body 2'], 'markdown', CellKind.Markdown, [], {}],
				[['body 3'], 'markdown', CellKind.Markdown, [], {}],
				[['## header 2.2'], 'markdown', CellKind.Markdown, [], {}],
				[['var e = 7;'], 'markdown', CellKind.Markdown, [], {}],
			],
			(editor, viewModel) => {
				const foldingController = new FoldingModel();
				foldingController.attachViewModel(viewModel);

				assert.equal(foldingController.regions.findRange(1), 0);
				assert.equal(foldingController.regions.findRange(2), 0);
				assert.equal(foldingController.regions.findRange(3), 1);
				assert.equal(foldingController.regions.findRange(4), 1);
				assert.equal(foldingController.regions.findRange(5), 1);
				assert.equal(foldingController.regions.findRange(6), 2);
				assert.equal(foldingController.regions.findRange(7), 2);
			}
		);
	});

	test('Top level header in a cell wins', function () {
		withTestNotebook(
			instantiationService,
			blukEditService,
			undoRedoService,
			[
				[['# header 1'], 'markdown', CellKind.Markdown, [], {}],
				[['body'], 'markdown', CellKind.Markdown, [], {}],
				[['## header 2.1\n# header3'], 'markdown', CellKind.Markdown, [], {}],
				[['body 2'], 'markdown', CellKind.Markdown, [], {}],
				[['body 3'], 'markdown', CellKind.Markdown, [], {}],
				[['## header 2.2'], 'markdown', CellKind.Markdown, [], {}],
				[['var e = 7;'], 'markdown', CellKind.Markdown, [], {}],
			],
			(editor, viewModel) => {
				const foldingController = new FoldingModel();
				foldingController.attachViewModel(viewModel);

				assert.equal(foldingController.regions.findRange(1), 0);
				assert.equal(foldingController.regions.findRange(2), 0);
				assert.equal(foldingController.regions.getEndLineNumber(0), 2);

				assert.equal(foldingController.regions.findRange(3), 1);
				assert.equal(foldingController.regions.findRange(4), 1);
				assert.equal(foldingController.regions.findRange(5), 1);
				assert.equal(foldingController.regions.getEndLineNumber(1), 7);

				assert.equal(foldingController.regions.findRange(6), 2);
				assert.equal(foldingController.regions.findRange(7), 2);
				assert.equal(foldingController.regions.getEndLineNumber(2), 7);
			}
		);
	});

	test('Folding', function () {
		withTestNotebook(
			instantiationService,
			blukEditService,
			undoRedoService,
			[
				[['# header 1'], 'markdown', CellKind.Markdown, [], {}],
				[['body'], 'markdown', CellKind.Markdown, [], {}],
				[['## header 2.1'], 'markdown', CellKind.Markdown, [], {}],
				[['body 2'], 'markdown', CellKind.Markdown, [], {}],
				[['body 3'], 'markdown', CellKind.Markdown, [], {}],
				[['## header 2.2'], 'markdown', CellKind.Markdown, [], {}],
				[['var e = 7;'], 'markdown', CellKind.Markdown, [], {}],
			],
			(editor, viewModel) => {
				const firstCell = viewModel.viewCells[0] as CellViewModel;
				viewModel.setFoldingState(firstCell, CellFoldingState.Collapsed);
				assert.deepEqual(viewModel.getHiddenRanges(), [
					{ start: 1, length: 6 }
				]);
			}
		);

		withTestNotebook(
			instantiationService,
			blukEditService,
			undoRedoService,
			[
				[['# header 1'], 'markdown', CellKind.Markdown, [], {}],
				[['body'], 'markdown', CellKind.Markdown, [], {}],
				[['## header 2.1\n'], 'markdown', CellKind.Markdown, [], {}],
				[['body 2'], 'markdown', CellKind.Markdown, [], {}],
				[['body 3'], 'markdown', CellKind.Markdown, [], {}],
				[['## header 2.2'], 'markdown', CellKind.Markdown, [], {}],
				[['var e = 7;'], 'markdown', CellKind.Markdown, [], {}],
			],
			(editor, viewModel) => {
				const thirdCell = viewModel.viewCells[2] as CellViewModel;
				viewModel.setFoldingState(thirdCell, CellFoldingState.Collapsed);
				assert.deepEqual(viewModel.getHiddenRanges(), [
					{ start: 3, length: 2 }
				]);
			}
		);

		withTestNotebook(
			instantiationService,
			blukEditService,
			undoRedoService,
			[
				[['# header 1'], 'markdown', CellKind.Markdown, [], {}],
				[['body'], 'markdown', CellKind.Markdown, [], {}],
				[['# header 2.1\n'], 'markdown', CellKind.Markdown, [], {}],
				[['body 2'], 'markdown', CellKind.Markdown, [], {}],
				[['body 3'], 'markdown', CellKind.Markdown, [], {}],
				[['## header 2.2'], 'markdown', CellKind.Markdown, [], {}],
				[['var e = 7;'], 'markdown', CellKind.Markdown, [], {}],
			],
			(editor, viewModel) => {
				const thirdCell = viewModel.viewCells[2] as CellViewModel;
				viewModel.setFoldingState(thirdCell, CellFoldingState.Collapsed);
				assert.deepEqual(viewModel.getHiddenRanges(), [
					{ start: 3, length: 4 }
				]);
			}
		);
	});

	test('Nested Folding', function () {
		withTestNotebook(
			instantiationService,
			blukEditService,
			undoRedoService,
			[
				[['# header 1'], 'markdown', CellKind.Markdown, [], {}],
				[['body'], 'markdown', CellKind.Markdown, [], {}],
				[['# header 2.1\n'], 'markdown', CellKind.Markdown, [], {}],
				[['body 2'], 'markdown', CellKind.Markdown, [], {}],
				[['body 3'], 'markdown', CellKind.Markdown, [], {}],
				[['## header 2.2'], 'markdown', CellKind.Markdown, [], {}],
				[['var e = 7;'], 'markdown', CellKind.Markdown, [], {}],
			],
			(editor, viewModel) => {
				viewModel.setFoldingState(viewModel.viewCells[0] as CellViewModel, CellFoldingState.Collapsed);
				assert.deepEqual(viewModel.getHiddenRanges(), [
					{ start: 1, length: 1 }
				]);

				viewModel.setFoldingState(viewModel.viewCells[5] as CellViewModel, CellFoldingState.Collapsed);
				viewModel.setFoldingState(viewModel.viewCells[2] as CellViewModel, CellFoldingState.Collapsed);
				assert.deepEqual(viewModel.getHiddenRanges(), [
					{ start: 1, length: 1 },
					{ start: 3, length: 4 }
				]);

				viewModel.setFoldingState(viewModel.viewCells[2] as CellViewModel, CellFoldingState.Expanded);
				assert.deepEqual(viewModel.getHiddenRanges(), [
					{ start: 1, length: 1 },
					{ start: 6, length: 1 }
				]);

				viewModel.insertCell(7, new TestCell(viewModel.viewType, 7, ['var c = 8;'], 'markdown', CellKind.Code, []), true);
				assert.deepEqual(viewModel.getHiddenRanges(), [
					{ start: 1, length: 1 },
					{ start: 6, length: 2 }
				]);

				viewModel.insertCell(1, new TestCell(viewModel.viewType, 8, ['var c = 9;'], 'markdown', CellKind.Code, []), true);
				assert.deepEqual(viewModel.getHiddenRanges(), [
					// the first collapsed range is now expanded as we insert content into it.
					// { start: 1, length: 2 },
					{ start: 7, length: 2 }
				]);
			}
		);
	});
});
