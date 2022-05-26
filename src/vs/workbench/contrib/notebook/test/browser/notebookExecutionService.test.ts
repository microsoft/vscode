/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { assertThrowsAsync } from 'vs/base/test/common/utils';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { IMenu, IMenuService } from 'vs/platform/actions/common/actions';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { insertCellAtIndex } from 'vs/workbench/contrib/notebook/browser/controller/cellOperations';
import { NotebookExecutionService } from 'vs/workbench/contrib/notebook/browser/notebookExecutionServiceImpl';
import { NotebookKernelService } from 'vs/workbench/contrib/notebook/browser/notebookKernelServiceImpl';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellKind, IOutputDto, NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernel, INotebookKernelService, ISelectedNotebooksChangeEvent } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { setupInstantiationService, withTestNotebook as _withTestNotebook } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';

suite('NotebookExecutionService', () => {

	let instantiationService: TestInstantiationService;
	let kernelService: INotebookKernelService;
	let disposables: DisposableStore;

	setup(function () {

		disposables = new DisposableStore();

		instantiationService = setupInstantiationService(disposables);

		instantiationService.stub(INotebookService, new class extends mock<INotebookService>() {
			override onDidAddNotebookDocument = Event.None;
			override onWillRemoveNotebookDocument = Event.None;
			override getNotebookTextModels() { return []; }
		});

		instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
			override createMenu() {
				return new class extends mock<IMenu>() {
					override onDidChange = Event.None;
					override getActions() { return []; }
					override dispose() { }
				};
			}
		});

		kernelService = instantiationService.createInstance(NotebookKernelService);
		instantiationService.set(INotebookKernelService, kernelService);

	});

	teardown(() => {
		disposables.dispose();
	});

	async function withTestNotebook(cells: [string, string, CellKind, IOutputDto[], NotebookCellMetadata][], callback: (viewModel: NotebookViewModel, textModel: NotebookTextModel) => void | Promise<void>) {
		return _withTestNotebook(cells, (editor, viewModel) => callback(viewModel, viewModel.notebookDocument));
	}

	// test('ctor', () => {
	// 	instantiationService.createInstance(NotebookEditorKernelManager, { activeKernel: undefined, viewModel: undefined });
	// 	const contextKeyService = instantiationService.get(IContextKeyService);

	// 	assert.strictEqual(contextKeyService.getContextKeyValue(NOTEBOOK_KERNEL_COUNT.key), 0);
	// });

	test('cell is not runnable when no kernel is selected', async () => {
		await withTestNotebook(
			[],
			async (viewModel) => {
				const executionService = instantiationService.createInstance(NotebookExecutionService);

				const cell = insertCellAtIndex(viewModel, 1, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true);
				await assertThrowsAsync(async () => await executionService.executeNotebookCell(cell));
			});
	});

	test('cell is not runnable when kernel does not support the language', async () => {
		await withTestNotebook(
			[],
			async (viewModel) => {

				kernelService.registerKernel(new TestNotebookKernel({ languages: ['testlang'] }));
				const executionService = instantiationService.createInstance(NotebookExecutionService);
				const cell = insertCellAtIndex(viewModel, 1, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true);
				await assertThrowsAsync(async () => await executionService.executeNotebookCell(cell));

			});
	});

	test('cell is runnable when kernel does support the language', async () => {
		await withTestNotebook(
			[],
			async (viewModel) => {
				const kernel = new TestNotebookKernel({ languages: ['javascript'] });
				kernelService.registerKernel(kernel);
				const executionService = instantiationService.createInstance(NotebookExecutionService);
				const executeSpy = sinon.spy();
				kernel.executeNotebookCellsRequest = executeSpy;

				const cell = insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true);
				await executionService.executeNotebookCells(viewModel.notebookDocument, [cell]);
				assert.strictEqual(executeSpy.calledOnce, true);
			});
	});

	test('select kernel when running cell', async function () {
		// https://github.com/microsoft/vscode/issues/121904

		return withTestNotebook([], async viewModel => {
			assert.strictEqual(kernelService.getMatchingKernel(viewModel.notebookDocument).all.length, 0);

			let didExecute = false;
			const kernel = new class extends TestNotebookKernel {
				constructor() {
					super({ languages: ['javascript'] });
					this.id = 'mySpecialId';
				}

				override async executeNotebookCellsRequest() {
					didExecute = true;
					return;
				}
			};

			kernelService.registerKernel(kernel);
			const executionService = instantiationService.createInstance(NotebookExecutionService);

			let event: ISelectedNotebooksChangeEvent | undefined;
			kernelService.onDidChangeSelectedNotebooks(e => event = e);

			const cell = insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true);
			await executionService.executeNotebookCells(viewModel.notebookDocument, [cell]);

			assert.strictEqual(didExecute, true);
			assert.ok(event !== undefined);
			assert.strictEqual(event.newKernel, kernel.id);
			assert.strictEqual(event.oldKernel, undefined);
		});
	});

	test('Completes unconfirmed executions', async function () {

		return withTestNotebook([], async viewModel => {
			let didExecute = false;
			const kernel = new class extends TestNotebookKernel {
				constructor() {
					super({ languages: ['javascript'] });
					this.id = 'mySpecialId';
				}

				override async executeNotebookCellsRequest() {
					didExecute = true;
					return;
				}
			};

			kernelService.registerKernel(kernel);
			const executionService = instantiationService.createInstance(NotebookExecutionService);
			const exeStateService = instantiationService.get(INotebookExecutionStateService);

			const cell = insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true);
			await executionService.executeNotebookCells(viewModel.notebookDocument, [cell]);

			assert.strictEqual(didExecute, true);
			assert.strictEqual(exeStateService.getCellExecution(cell.uri), undefined);
		});
	});
});

class TestNotebookKernel implements INotebookKernel {
	id: string = 'test';
	label: string = '';
	viewType = '*';
	onDidChange = Event.None;
	extension: ExtensionIdentifier = new ExtensionIdentifier('test');
	localResourceRoot: URI = URI.file('/test');
	description?: string | undefined;
	detail?: string | undefined;
	preloadUris: URI[] = [];
	preloadProvides: string[] = [];
	supportedLanguages: string[] = [];
	executeNotebookCellsRequest(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	cancelNotebookCellExecution(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	constructor(opts?: { languages: string[] }) {
		this.supportedLanguages = opts?.languages ?? [PLAINTEXT_LANGUAGE_ID];
	}
	kind?: string | undefined;
	implementsInterrupt?: boolean | undefined;
	implementsExecutionOrder?: boolean | undefined;
}
