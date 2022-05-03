/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise } from 'vs/base/common/async';
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { insertCellAtIndex } from 'vs/workbench/contrib/notebook/browser/controller/cellOperations';
import { NotebookExecutionService } from 'vs/workbench/contrib/notebook/browser/notebookExecutionServiceImpl';
import { NotebookExecutionStateService } from 'vs/workbench/contrib/notebook/browser/notebookExecutionStateServiceImpl';
import { NotebookKernelService } from 'vs/workbench/contrib/notebook/browser/notebookKernelServiceImpl';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellEditType, CellKind, CellUri, IOutputDto, NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionService } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernelService, IResolvedNotebookKernel, NotebookKernelType } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { setupInstantiationService, withTestNotebook as _withTestNotebook } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';

suite('NotebookExecutionStateService', () => {

	let instantiationService: TestInstantiationService;
	let kernelService: INotebookKernelService;
	let disposables: DisposableStore;
	let testNotebookModel: NotebookTextModel | undefined;

	setup(function () {

		disposables = new DisposableStore();

		instantiationService = setupInstantiationService(disposables);

		instantiationService.stub(INotebookService, new class extends mock<INotebookService>() {
			override onDidAddNotebookDocument = Event.None;
			override onWillRemoveNotebookDocument = Event.None;
			override getNotebookTextModels() { return []; }
			override getNotebookTextModel(uri: URI): NotebookTextModel | undefined {
				return testNotebookModel;
			}
		});

		kernelService = instantiationService.createInstance(NotebookKernelService);
		instantiationService.set(INotebookKernelService, kernelService);
		instantiationService.set(INotebookExecutionService, instantiationService.createInstance(NotebookExecutionService));
		instantiationService.set(INotebookExecutionStateService, instantiationService.createInstance(NotebookExecutionStateService));
	});

	teardown(() => {
		disposables.dispose();
	});

	async function withTestNotebook(cells: [string, string, CellKind, IOutputDto[], NotebookCellMetadata][], callback: (viewModel: NotebookViewModel, textModel: NotebookTextModel) => void | Promise<void>) {
		return _withTestNotebook(cells, (editor, viewModel) => callback(viewModel, viewModel.notebookDocument));
	}

	test('cancel execution when cell is deleted', async function () { // TODO@roblou Should be a test for NotebookExecutionListeners, which can be a standalone contribution
		return withTestNotebook([], async viewModel => {
			testNotebookModel = viewModel.notebookDocument;

			let didCancel = false;
			const kernel = new class extends TestNotebookKernel {
				constructor() {
					super({ languages: ['javascript'] });
				}

				override async executeNotebookCellsRequest(): Promise<void> { }

				override async cancelNotebookCellExecution(): Promise<void> {
					didCancel = true;
				}
			};
			kernelService.registerKernel(kernel);
			kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);

			const executionStateService: INotebookExecutionStateService = instantiationService.get(INotebookExecutionStateService);

			const cell = insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true);
			executionStateService.createCellExecution(kernel.id, viewModel.uri, cell.handle);
			assert.strictEqual(didCancel, false);
			viewModel.notebookDocument.applyEdits([{
				editType: CellEditType.Replace, index: 0, count: 1, cells: []
			}], true, undefined, () => undefined, undefined, false);
			assert.strictEqual(didCancel, true);
		});
	});

	test('fires onDidChangeCellExecution when cell is completed while deleted', async function () {
		return withTestNotebook([], async viewModel => {
			testNotebookModel = viewModel.notebookDocument;

			const kernel = new TestNotebookKernel();
			kernelService.registerKernel(kernel);
			kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);

			const executionStateService: INotebookExecutionStateService = instantiationService.get(INotebookExecutionStateService);
			const cell = insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true);
			const exe = executionStateService.createCellExecution(kernel.id, viewModel.uri, cell.handle);

			let didFire = false;
			disposables.add(executionStateService.onDidChangeCellExecution(e => {
				didFire = !e.changed;
			}));

			viewModel.notebookDocument.applyEdits([{
				editType: CellEditType.Replace, index: 0, count: 1, cells: []
			}], true, undefined, () => undefined, undefined, false);
			exe.complete({});
			assert.strictEqual(didFire, true);
		});
	});

	// #142466
	test('getCellExecution and onDidChangeCellExecution', async function () {
		return withTestNotebook([], async viewModel => {
			testNotebookModel = viewModel.notebookDocument;

			const kernel = new TestNotebookKernel();
			kernelService.registerKernel(kernel);
			kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);

			const executionStateService: INotebookExecutionStateService = instantiationService.get(INotebookExecutionStateService);
			const cell = insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true);

			const deferred = new DeferredPromise<void>();
			disposables.add(executionStateService.onDidChangeCellExecution(e => {
				const cellUri = CellUri.generate(e.notebook, e.cellHandle);
				const exe = executionStateService.getCellExecution(cellUri);
				assert.ok(exe);
				assert.strictEqual(e.notebook.toString(), exe.notebook.toString());
				assert.strictEqual(e.cellHandle, exe.cellHandle);

				assert.strictEqual(exe.notebook.toString(), e.changed?.notebook.toString());
				assert.strictEqual(exe.cellHandle, e.changed?.cellHandle);

				deferred.complete();
			}));

			executionStateService.createCellExecution(kernel.id, viewModel.uri, cell.handle);

			return deferred.p;
		});
	});

	test('force-cancel works', async function () {
		return withTestNotebook([], async viewModel => {
			testNotebookModel = viewModel.notebookDocument;

			const kernel = new TestNotebookKernel();
			kernelService.registerKernel(kernel);
			kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);

			const executionStateService: INotebookExecutionStateService = instantiationService.get(INotebookExecutionStateService);
			const cell = insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true);
			executionStateService.createCellExecution(kernel.id, viewModel.uri, cell.handle);
			const exe = executionStateService.getCellExecution(cell.uri);
			assert.ok(exe);

			executionStateService.forceCancelNotebookExecutions(viewModel.uri);
			const exe2 = executionStateService.getCellExecution(cell.uri);
			assert.strictEqual(exe2, undefined);
		});
	});
});

class TestNotebookKernel implements IResolvedNotebookKernel {
	type: NotebookKernelType.Resolved = NotebookKernelType.Resolved;
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
	async executeNotebookCellsRequest(): Promise<void> { }
	async cancelNotebookCellExecution(): Promise<void> { }

	constructor(opts?: { languages?: string[]; id?: string }) {
		this.supportedLanguages = opts?.languages ?? [PLAINTEXT_LANGUAGE_ID];
		if (opts?.id) {
			this.id = opts?.id;
		}
	}
}
