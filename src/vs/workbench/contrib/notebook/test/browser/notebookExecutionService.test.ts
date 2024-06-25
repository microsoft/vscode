/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { AsyncIterableObject } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { assertThrowsAsync, ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { IMenu, IMenuService } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { insertCellAtIndex } from 'vs/workbench/contrib/notebook/browser/controller/cellOperations';
import { NotebookExecutionService } from 'vs/workbench/contrib/notebook/browser/services/notebookExecutionServiceImpl';
import { NotebookKernelService } from 'vs/workbench/contrib/notebook/browser/services/notebookKernelServiceImpl';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellKind, IOutputDto, NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernel, INotebookKernelHistoryService, INotebookKernelService, INotebookTextModelLike, VariablesResult } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { setupInstantiationService, withTestNotebook as _withTestNotebook } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';

suite('NotebookExecutionService', () => {

	let instantiationService: TestInstantiationService;
	let contextKeyService: IContextKeyService;
	let kernelService: INotebookKernelService;
	let disposables: DisposableStore;

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

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

		instantiationService.stub(INotebookKernelHistoryService, new class extends mock<INotebookKernelHistoryService>() {
			override getKernels(notebook: INotebookTextModelLike) {
				return kernelService.getMatchingKernel(notebook);
			}
			override addMostRecentKernel(kernel: INotebookKernel): void { }
		});

		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override executeCommand(_commandId: string, ..._args: any[]) {
				return Promise.resolve(undefined);
			}
		});

		kernelService = disposables.add(instantiationService.createInstance(NotebookKernelService));
		instantiationService.set(INotebookKernelService, kernelService);
		contextKeyService = instantiationService.get(IContextKeyService);
	});

	async function withTestNotebook(cells: [string, string, CellKind, IOutputDto[], NotebookCellMetadata][], callback: (viewModel: NotebookViewModel, textModel: NotebookTextModel, disposables: DisposableStore) => void | Promise<void>) {
		return _withTestNotebook(cells, (editor, viewModel, disposables) => callback(viewModel, viewModel.notebookDocument, disposables));
	}

	// test('ctor', () => {
	// 	instantiationService.createInstance(NotebookEditorKernelManager, { activeKernel: undefined, viewModel: undefined });
	// 	const contextKeyService = instantiationService.get(IContextKeyService);

	// 	assert.strictEqual(contextKeyService.getContextKeyValue(NOTEBOOK_KERNEL_COUNT.key), 0);
	// });

	test('cell is not runnable when no kernel is selected', async () => {
		await withTestNotebook(
			[],
			async (viewModel, textModel, disposables) => {
				const executionService = instantiationService.createInstance(NotebookExecutionService);

				const cell = insertCellAtIndex(viewModel, 1, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true);
				await assertThrowsAsync(async () => await executionService.executeNotebookCells(textModel, [cell.model], contextKeyService));
			});
	});

	test('cell is not runnable when kernel does not support the language', async () => {
		await withTestNotebook(
			[],
			async (viewModel, textModel) => {

				disposables.add(kernelService.registerKernel(new TestNotebookKernel({ languages: ['testlang'] })));
				const executionService = disposables.add(instantiationService.createInstance(NotebookExecutionService));
				const cell = disposables.add(insertCellAtIndex(viewModel, 1, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true));
				await assertThrowsAsync(async () => await executionService.executeNotebookCells(textModel, [cell.model], contextKeyService));

			});
	});

	test('cell is runnable when kernel does support the language', async () => {
		await withTestNotebook(
			[],
			async (viewModel, textModel) => {
				const kernel = new TestNotebookKernel({ languages: ['javascript'] });
				disposables.add(kernelService.registerKernel(kernel));
				kernelService.selectKernelForNotebook(kernel, textModel);
				const executionService = disposables.add(instantiationService.createInstance(NotebookExecutionService));
				const executeSpy = sinon.spy();
				kernel.executeNotebookCellsRequest = executeSpy;

				const cell = disposables.add(insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true));
				await executionService.executeNotebookCells(viewModel.notebookDocument, [cell.model], contextKeyService);
				assert.strictEqual(executeSpy.calledOnce, true);
			});
	});

	test('Completes unconfirmed executions', async function () {

		return withTestNotebook([], async (viewModel, textModel) => {
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

			disposables.add(kernelService.registerKernel(kernel));
			kernelService.selectKernelForNotebook(kernel, textModel);
			const executionService = disposables.add(instantiationService.createInstance(NotebookExecutionService));
			const exeStateService = instantiationService.get(INotebookExecutionStateService);

			const cell = disposables.add(insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true));
			await executionService.executeNotebookCells(textModel, [cell.model], contextKeyService);

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
	provideVariables(notebookUri: URI, parentId: number | undefined, kind: 'named' | 'indexed', start: number, token: CancellationToken): AsyncIterableObject<VariablesResult> {
		return AsyncIterableObject.EMPTY;
	}
	executeNotebookCellsRequest(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	cancelNotebookCellExecution(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	constructor(opts?: { languages: string[] }) {
		this.supportedLanguages = opts?.languages ?? [PLAINTEXT_LANGUAGE_ID];
	}
	implementsInterrupt?: boolean | undefined;
	implementsExecutionOrder?: boolean | undefined;
}
