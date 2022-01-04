/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { timeout } from 'vs/base/common/async';
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
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellEditType, CellKind, IOutputDto, NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionService } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { INotebookKernel, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { setupInstantiationService, withTestNotebook as _withTestNotebook } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';

suite('NotebookExecutionStateService', () => {

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

		kernelService = instantiationService.createInstance(NotebookKernelService);
		instantiationService.set(INotebookKernelService, kernelService);
		instantiationService.set(INotebookExecutionService, instantiationService.createInstance(NotebookExecutionService));
	});

	teardown(() => {
		disposables.dispose();
	});

	async function withTestNotebook(cells: [string, string, CellKind, IOutputDto[], NotebookCellMetadata][], callback: (viewModel: NotebookViewModel, textModel: NotebookTextModel) => void | Promise<void>) {
		return _withTestNotebook(cells, (editor, viewModel) => callback(viewModel, viewModel.notebookDocument));
	}

	test('cancel execution when cell is deleted', async function () {
		return withTestNotebook([], async viewModel => {
			instantiationService.stub(INotebookService, new class extends mock<INotebookService>() {
				override getNotebookTextModel(uri: URI): NotebookTextModel | undefined {
					return viewModel.notebookDocument;
				}
			});

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

			const executionStateService: NotebookExecutionStateService = instantiationService.createInstance(NotebookExecutionStateService);

			const cell = insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true);
			executionStateService.createNotebookCellExecution(viewModel.uri, cell.handle);
			assert.strictEqual(didCancel, false);
			viewModel.notebookDocument.applyEdits([{
				editType: CellEditType.Replace, index: 0, count: 1, cells: []
			}], true, undefined, () => undefined, undefined, false);
			await timeout(0);
			assert.strictEqual(didCancel, true);
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
}
