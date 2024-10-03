/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NotebookMultiCursorController, NotebookMultiCursorState } from '../../browser/contrib/multicursor/notebookMulticursor.js';
import { CellKind, NotebookSetting } from '../../common/notebookCommon.js';
import { setupInstantiationService, withTestNotebook } from './testNotebookEditor.js';
import { createCodeEditorServices, instantiateTestCodeEditor, ITestCodeEditor, TestCodeEditorInstantiationOptions } from '../../../../../editor/test/browser/testCodeEditor.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ITextBuffer } from '../../../../../editor/common/model.js';
import { instantiateTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { CellViewModel } from '../../browser/viewModel/notebookViewModelImpl.js';

function prepareTestCodeEditor(cell: CellViewModel, options: TestCodeEditorInstantiationOptions, disposables: DisposableStore): ITestCodeEditor {
	const instantiationService = createCodeEditorServices(disposables);

	const textModel = instantiateTextModel(instantiationService, {
		create: () => {
			return { textBuffer: (cell.textBuffer as ITextBuffer), disposable: disposables };
		},
		getFirstLineText: (lengthLimit: number) => {
			return cell.textBuffer.getLineContent(1).substr(0, lengthLimit);
		}
	});
	disposables.add(textModel);

	cell.model.textModel = textModel;
	const editor = disposables.add(instantiateTestCodeEditor(instantiationService, textModel, options));
	cell.attachTextEditor(editor);
	return editor;
}

suite('NotebookMultiCursor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let config: TestConfigurationService;
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = setupInstantiationService(store);
		config = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, config);
		config.setUserConfiguration(NotebookSetting.multiCursor, true);
	});

	teardown(() => {
	});

	test('Notebook multi cursor init', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}]
			],
			async (notebook, viewModel, ds) => {
				store.add(ds);

				// setup nb
				const firstCell = viewModel.cellAt(0)!;
				notebook.attachEditorToCellViewModel(firstCell, prepareTestCodeEditor(firstCell, {}, ds));
				const secondCell = viewModel.cellAt(1)!;
				notebook.attachEditorToCellViewModel(secondCell, prepareTestCodeEditor(secondCell, {}, ds));

				// setup controller + init selections
				const controller = store.add(instantiationService.createInstance(NotebookMultiCursorController, notebook));
				notebook.setActiveCell(firstCell);
				firstCell.setSelections([new Selection(1, 1, 1, 1)]);
				secondCell.setSelections([new Selection(1, 1, 1, 1)]);

				// trigger cmd+d actions
				controller.findAndTrackNextSelection(viewModel.cellAt(0)!);
				assert.equal(controller.getState(), NotebookMultiCursorState.Selecting);
				assert.deepEqual(viewModel.viewCells[0].getSelections()[0], new Selection(1, 1, 1, 4));
			});
	});

	test('Notebook multi cursor second cmd+d', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}]
			],
			async (notebook, viewModel, ds) => {
				store.add(ds);

				// setup nb
				const firstCell = viewModel.cellAt(0)!;
				notebook.attachEditorToCellViewModel(firstCell, prepareTestCodeEditor(firstCell, {}, ds));
				const secondCell = viewModel.cellAt(1)!;
				notebook.attachEditorToCellViewModel(secondCell, prepareTestCodeEditor(secondCell, {}, ds));

				// setup controller + init selections
				const controller = store.add(instantiationService.createInstance(NotebookMultiCursorController, notebook));
				notebook.setActiveCell(firstCell);
				firstCell.setSelections([new Selection(1, 1, 1, 1)]);
				secondCell.setSelections([new Selection(1, 1, 1, 1)]);

				// trigger cmd+d actions
				controller.findAndTrackNextSelection(viewModel.cellAt(0)!); // select the word
				controller.findAndTrackNextSelection(viewModel.cellAt(0)!); // select the word in the second cell
				assert.deepEqual(viewModel.viewCells[1].getSelections()[0], new Selection(1, 1, 1, 4));
			});
	});

});
