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
import { NotebookAddMatchToMultiSelectionAction } from '../../browser/contrib/multicursor/notebookMulticursor.js';
import { INotebookActionContext } from '../../browser/controller/coreActions.js';
import { CellKind, NotebookSetting } from '../../common/notebookCommon.js';
import { setupInstantiationService, withTestNotebook } from './testNotebookEditor.js';

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

	test('Add Find Match to selection', async function () {
		await withTestNotebook(
			[
				['var a = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
			],
			async (editor, viewModel) => {
				const context: INotebookActionContext = { notebookEditor: editor };


				// editor.setCellEditorSelection(viewModel.viewCells[0], new Selection(1, 2, 1, 2));
				// const test0 = viewModel.viewCells[0].getSelections()[0];

				// viewModel.viewCells[0].setSelections([new Selection(1, 2, 1, 2)]);
				// const test1 = viewModel.viewCells[0].getSelections()[0];


				await NotebookAddMatchToMultiSelectionAction.handleAddMatchToSelection(context);
				assert.strictEqual(viewModel.viewCells[0].getSelections()[0], new Selection(1, 1, 1, 4));
			}
		);
	});
});
