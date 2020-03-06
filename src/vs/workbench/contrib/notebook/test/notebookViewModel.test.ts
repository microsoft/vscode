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
import { createTestCellViewModel, TestNotebook, withTestNotebook } from 'vs/workbench/contrib/notebook/test/testNotebookEditor';

suite('NotebookViewModel', () => {
	const instantiationService = new TestInstantiationService();

	test('ctor', function () {
		const notebook = new TestNotebook(0, 'notebook', URI.parse('test'));
		const model = new NotebookEditorModel(notebook);
		const viewModel = new NotebookViewModel('notebook', model, instantiationService);
		assert.equal(viewModel.viewType, 'notebook');
	});

	test('insert/delete', function () {
		withTestNotebook(
			instantiationService,
			[
				[['var a = 1;'], 'javascript', CellKind.Code, []],
				[['var b = 2;'], 'javascript', CellKind.Code, []]
			],
			(editor, viewModel) => {
				const cell = createTestCellViewModel(instantiationService, viewModel.viewType, viewModel.handle, 0, ['var c = 3;'], 'javascript', CellKind.Code, []);
				viewModel.insertCell(1, cell);
				assert.equal(viewModel.viewCells.length, 3);
				assert.equal(viewModel.notebookDocument.cells.length, 3);
				assert.equal(viewModel.getViewCellIndex(cell), 1);

				viewModel.deleteCell(1);
				assert.equal(viewModel.viewCells.length, 2);
				assert.equal(viewModel.notebookDocument.cells.length, 2);
				assert.equal(viewModel.getViewCellIndex(cell), -1);
			}
		);
	});

	test('index', function () {
		withTestNotebook(
			instantiationService,
			[
				[['var a = 1;'], 'javascript', CellKind.Code, []],
				[['var b = 2;'], 'javascript', CellKind.Code, []]
			],
			(editor, viewModel) => {
				const firstViewCell = viewModel.viewCells[0];
				const lastViewCell = viewModel.viewCells[viewModel.viewCells.length - 1];

				const insertIndex = viewModel.getViewCellIndex(firstViewCell) + 1;
				const cell = createTestCellViewModel(instantiationService, viewModel.viewType, viewModel.handle, 3, ['var c = 3;'], 'javascript', CellKind.Code, []);
				viewModel.insertCell(insertIndex, cell);

				const addedCellIndex = viewModel.getViewCellIndex(cell);
				viewModel.deleteCell(addedCellIndex);

				const secondInsertIndex = viewModel.getViewCellIndex(lastViewCell) + 1;
				const cell2 = createTestCellViewModel(instantiationService, viewModel.viewType, viewModel.handle, 4, ['var d = 4;'], 'javascript', CellKind.Code, []);
				viewModel.insertCell(secondInsertIndex, cell2);

				assert.equal(viewModel.viewCells.length, 3);
				assert.equal(viewModel.notebookDocument.cells.length, 3);
				assert.equal(viewModel.getViewCellIndex(cell2), 2);
			}
		);
	});
});
