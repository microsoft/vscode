/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { NotebookEditorModel } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { withTestNotebook, TestCell } from 'vs/workbench/contrib/notebook/test/testNotebookEditor';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';

suite('NotebookViewModel', () => {
	const instantiationService = new TestInstantiationService();
	const blukEditService = instantiationService.get(IBulkEditService);
	const undoRedoService = instantiationService.stub(IUndoRedoService, () => { });
	instantiationService.spy(IUndoRedoService, 'pushElement');

	test('ctor', function () {
		const notebook = new NotebookTextModel(0, 'notebook', URI.parse('test'));
		const model = new NotebookEditorModel(notebook);
		const viewModel = new NotebookViewModel('notebook', model, instantiationService, blukEditService, undoRedoService);
		assert.equal(viewModel.viewType, 'notebook');
	});

	test('insert/delete', function () {
		withTestNotebook(
			instantiationService,
			blukEditService,
			undoRedoService,
			[
				[['var a = 1;'], 'javascript', CellKind.Code, [], { editable: true }],
				[['var b = 2;'], 'javascript', CellKind.Code, [], { editable: false }]
			],
			(editor, viewModel) => {
				const cell = viewModel.insertCell(1, new TestCell(viewModel.viewType, 0, ['var c = 3;'], 'javascript', CellKind.Code, []), true);
				assert.equal(viewModel.viewCells.length, 3);
				assert.equal(viewModel.notebookDocument.cells.length, 3);
				assert.equal(viewModel.getViewCellIndex(cell), 1);
				assert.equal(viewModel.viewCells[0].metadata?.editable, true);
				assert.equal(viewModel.viewCells[0].metadata?.editable, false);

				viewModel.deleteCell(1, true);
				assert.equal(viewModel.viewCells.length, 2);
				assert.equal(viewModel.notebookDocument.cells.length, 2);
				assert.equal(viewModel.getViewCellIndex(cell), -1);
			}
		);
	});

	test('index', function () {
		withTestNotebook(
			instantiationService,
			blukEditService,
			undoRedoService,
			[
				[['var a = 1;'], 'javascript', CellKind.Code, [], { editable: true }],
				[['var b = 2;'], 'javascript', CellKind.Code, [], { editable: true }]
			],
			(editor, viewModel) => {
				const firstViewCell = viewModel.viewCells[0];
				const lastViewCell = viewModel.viewCells[viewModel.viewCells.length - 1];

				const insertIndex = viewModel.getViewCellIndex(firstViewCell) + 1;
				const cell = viewModel.insertCell(insertIndex, new TestCell(viewModel.viewType, 3, ['var c = 3;'], 'javascript', CellKind.Code, []), true);

				const addedCellIndex = viewModel.getViewCellIndex(cell);
				viewModel.deleteCell(addedCellIndex, true);

				const secondInsertIndex = viewModel.getViewCellIndex(lastViewCell) + 1;
				const cell2 = viewModel.insertCell(secondInsertIndex, new TestCell(viewModel.viewType, 4, ['var d = 4;'], 'javascript', CellKind.Code, []), true);

				assert.equal(viewModel.viewCells.length, 3);
				assert.equal(viewModel.notebookDocument.cells.length, 3);
				assert.equal(viewModel.getViewCellIndex(cell2), 2);
			}
		);
	});
});
