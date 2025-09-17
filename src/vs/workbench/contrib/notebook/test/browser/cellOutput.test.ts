/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CellOutputContainer } from '../../browser/view/cellParts/cellOutput.js';
import { CodeCellRenderTemplate } from '../../browser/view/notebookRenderingCommon.js';
import { CodeCellViewModel } from '../../browser/viewModel/codeCellViewModel.js';
import { CellKind, INotebookRendererInfo, IOutputDto } from '../../common/notebookCommon.js';
import { setupInstantiationService, withTestNotebook } from './testNotebookEditor.js';
import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { INotebookService } from '../../common/notebookService.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IMenu, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { getAllOutputsText } from '../../browser/viewModel/cellOutputTextHelper.js';

suite('CellOutput', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let outputMenus: IMenu[] = [];

	setup(() => {
		outputMenus = [];
		instantiationService = setupInstantiationService(store);
		instantiationService.stub(INotebookService, new class extends mock<INotebookService>() {
			override getOutputMimeTypeInfo(_textModel: any, _kernelProvides: readonly string[] | undefined, output: IOutputDto) {
				return [{
					rendererId: 'plainTextRendererId',
					mimeType: 'text/plain',
					isTrusted: true
				}, {
					rendererId: 'htmlRendererId',
					mimeType: 'text/html',
					isTrusted: true
				}, {
					rendererId: 'errorRendererId',
					mimeType: 'application/vnd.code.notebook.error',
					isTrusted: true
				}, {
					rendererId: 'stderrRendererId',
					mimeType: 'application/vnd.code.notebook.stderr',
					isTrusted: true
				}, {
					rendererId: 'stdoutRendererId',
					mimeType: 'application/vnd.code.notebook.stdout',
					isTrusted: true
				}]
					.filter(info => output.outputs.some(output => output.mime === info.mimeType));
			}
			override getRendererInfo(): INotebookRendererInfo {
				return {
					id: 'rendererId',
					displayName: 'Stubbed Renderer',
					extensionId: { _lower: 'id', value: 'id' },
				} as INotebookRendererInfo;
			}
		});
		instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
			override createMenu() {
				const menu = new class extends mock<IMenu>() {
					override onDidChange = Event.None;
					override getActions() { return []; }
					override dispose() { outputMenus = outputMenus.filter(item => item !== menu); }
				};
				outputMenus.push(menu);
				return menu;
			}
		});
	});

	test('Render cell output items with multiple mime types', async function () {
		const outputItem = { data: VSBuffer.fromString('output content'), mime: 'text/plain' };
		const htmlOutputItem = { data: VSBuffer.fromString('output content'), mime: 'text/html' };
		const output1: IOutputDto = { outputId: 'abc', outputs: [outputItem, htmlOutputItem] };
		const output2: IOutputDto = { outputId: 'def', outputs: [outputItem, htmlOutputItem] };

		await withTestNotebook(
			[
				['print(output content)', 'python', CellKind.Code, [output1, output2], {}],
			],
			(editor, viewModel, disposables, accessor) => {

				const cell = viewModel.viewCells[0] as CodeCellViewModel;
				const cellTemplate = createCellTemplate(disposables);
				const output = disposables.add(accessor.createInstance(CellOutputContainer, editor, cell, cellTemplate, { limit: 100 }));
				output.render();
				cell.outputsViewModels[0].setVisible(true);
				assert.strictEqual(outputMenus.length, 1, 'should have 1 output menus');
				assert(cellTemplate.outputContainer.domNode.style.display !== 'none', 'output container should be visible');
				cell.outputsViewModels[1].setVisible(true);
				assert.strictEqual(outputMenus.length, 2, 'should have 2 output menus');
				cell.outputsViewModels[1].setVisible(true);
				assert.strictEqual(outputMenus.length, 2, 'should still have 2 output menus');
			},
			instantiationService
		);
	});

	test('One of many cell outputs becomes hidden', async function () {
		const outputItem = { data: VSBuffer.fromString('output content'), mime: 'text/plain' };
		const htmlOutputItem = { data: VSBuffer.fromString('output content'), mime: 'text/html' };
		const output1: IOutputDto = { outputId: 'abc', outputs: [outputItem, htmlOutputItem] };
		const output2: IOutputDto = { outputId: 'def', outputs: [outputItem, htmlOutputItem] };
		const output3: IOutputDto = { outputId: 'ghi', outputs: [outputItem, htmlOutputItem] };

		await withTestNotebook(
			[
				['print(output content)', 'python', CellKind.Code, [output1, output2, output3], {}],
			],
			(editor, viewModel, disposables, accessor) => {

				const cell = viewModel.viewCells[0] as CodeCellViewModel;
				const cellTemplate = createCellTemplate(disposables);
				const output = disposables.add(accessor.createInstance(CellOutputContainer, editor, cell, cellTemplate, { limit: 100 }));
				output.render();
				cell.outputsViewModels[0].setVisible(true);
				cell.outputsViewModels[1].setVisible(true);
				cell.outputsViewModels[2].setVisible(true);
				cell.outputsViewModels[1].setVisible(false);
				assert(cellTemplate.outputContainer.domNode.style.display !== 'none', 'output container should be visible');
				assert.strictEqual(outputMenus.length, 2, 'should have 2 output menus');
			},
			instantiationService
		);
	});

	test('get all adjacent stream outputs', async () => {
		const stdout = { data: VSBuffer.fromString('stdout'), mime: 'application/vnd.code.notebook.stdout' };
		const stderr = { data: VSBuffer.fromString('stderr'), mime: 'application/vnd.code.notebook.stderr' };
		const output1: IOutputDto = { outputId: 'abc', outputs: [stdout] };
		const output2: IOutputDto = { outputId: 'abc', outputs: [stderr] };

		await withTestNotebook(
			[
				['print(output content)', 'python', CellKind.Code, [output1, output2], {}],
			],
			(_editor, viewModel) => {
				const cell = viewModel.viewCells[0];
				const notebook = viewModel.notebookDocument;
				const result = getAllOutputsText(notebook, cell);

				assert.strictEqual(result, 'stdoutstderr');
			},
			instantiationService
		);
	});

	test('get all mixed outputs of cell', async () => {
		const stdout = { data: VSBuffer.fromString('stdout'), mime: 'application/vnd.code.notebook.stdout' };
		const stderr = { data: VSBuffer.fromString('stderr'), mime: 'application/vnd.code.notebook.stderr' };
		const plainText = { data: VSBuffer.fromString('output content'), mime: 'text/plain' };
		const error = { data: VSBuffer.fromString(`{"name":"Error Name","message":"error message","stack":"error stack"}`), mime: 'application/vnd.code.notebook.error' };
		const output1: IOutputDto = { outputId: 'abc', outputs: [stdout] };
		const output2: IOutputDto = { outputId: 'abc', outputs: [stderr] };
		const output3: IOutputDto = { outputId: 'abc', outputs: [plainText] };
		const output4: IOutputDto = { outputId: 'abc', outputs: [error] };

		await withTestNotebook(
			[
				['print(output content)', 'python', CellKind.Code, [output1, output2, output3, output4], {}],
			],
			(_editor, viewModel) => {
				const cell = viewModel.viewCells[0];
				const notebook = viewModel.notebookDocument;
				const result = getAllOutputsText(notebook, cell);

				assert.strictEqual(result,
					'Cell output 1 of 3\n' +
					'stdoutstderr\n' +
					'Cell output 2 of 3\n' +
					'output content\n' +
					'Cell output 3 of 3\n' +
					'error stack'
				);
			},
			instantiationService
		);

	});

	/**
	 * Test that verifies the fix for memory leak where toolbar attachment state was not properly managed.
	 * Previously, rapid visibility changes would create multiple menu service listeners without proper cleanup.
	 */
	test('Toolbar does not leak menu listeners when visibility changes', async function () {
		const outputItem = { data: VSBuffer.fromString('output content'), mime: 'text/plain' };
		const output1: IOutputDto = { outputId: 'abc', outputs: [outputItem] };

		await withTestNotebook(
			[
				['print(output content)', 'python', CellKind.Code, [output1], {}],
			],
			(editor, viewModel, disposables, accessor) => {

				const cell = viewModel.viewCells[0] as CodeCellViewModel;
				const cellTemplate = createCellTemplate(disposables);
				const output = disposables.add(accessor.createInstance(CellOutputContainer, editor, cell, cellTemplate, { limit: 100 }));
				output.render();
				
				// Initially hidden, should not create menu
				assert.strictEqual(outputMenus.length, 0, 'should not have output menus when hidden');
				
				// Show first output - should create menu
				cell.outputsViewModels[0].setVisible(true);
				assert.strictEqual(outputMenus.length, 1, 'should have 1 output menu when visible');
				
				// Hide output - should not change menu count (menus are cleared but not destroyed)
				cell.outputsViewModels[0].setVisible(false);
				assert.strictEqual(outputMenus.length, 1, 'should still have 1 output menu');
				
				// Show again - should not create additional menu (testing for the leak fix)
				cell.outputsViewModels[0].setVisible(true);
				assert.strictEqual(outputMenus.length, 1, 'should still have only 1 output menu after showing again');
				
				// Multiple visibility toggles should not create additional menus
				cell.outputsViewModels[0].setVisible(false);
				cell.outputsViewModels[0].setVisible(true);
				cell.outputsViewModels[0].setVisible(false);
				cell.outputsViewModels[0].setVisible(true);
				assert.strictEqual(outputMenus.length, 1, 'should still have only 1 output menu after multiple toggles');
			},
			instantiationService
		);
	});


});

function createCellTemplate(disposables: DisposableStore) {
	return {
		outputContainer: new FastDomNode(document.createElement('div')),
		outputShowMoreContainer: new FastDomNode(document.createElement('div')),
		focusSinkElement: document.createElement('div'),
		templateDisposables: disposables,
		elementDisposables: disposables,
	} as unknown as CodeCellRenderTemplate;
}
