/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { AsyncIterableObject } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { assertThrowsAsync, ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { IMenu, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { insertCellAtIndex } from '../../browser/controller/cellOperations.js';
import { NotebookExecutionService } from '../../browser/services/notebookExecutionServiceImpl.js';
import { NotebookKernelService } from '../../browser/services/notebookKernelServiceImpl.js';
import { NotebookViewModel } from '../../browser/viewModel/notebookViewModelImpl.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { CellKind, IOutputDto, NotebookCellMetadata } from '../../common/notebookCommon.js';
import { INotebookExecutionStateService } from '../../common/notebookExecutionStateService.js';
import { INotebookKernel, INotebookKernelHistoryService, INotebookKernelService, INotebookTextModelLike, VariablesResult } from '../../common/notebookKernelService.js';
import { INotebookLoggingService } from '../../common/notebookLoggingService.js';
import { INotebookService } from '../../common/notebookService.js';
import { setupInstantiationService, withTestNotebook as _withTestNotebook } from './testNotebookEditor.js';

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

		instantiationService.stub(INotebookLoggingService, new class extends mock<INotebookLoggingService>() {
			override debug(category: string, output: string): void {
				//
			}
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
