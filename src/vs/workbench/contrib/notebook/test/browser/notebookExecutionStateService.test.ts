/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { AsyncIterableProducer, DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { IMenu, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { insertCellAtIndex } from '../../browser/controller/cellOperations.js';
import { NotebookExecutionService } from '../../browser/services/notebookExecutionServiceImpl.js';
import { NotebookExecutionStateService } from '../../browser/services/notebookExecutionStateServiceImpl.js';
import { NotebookKernelService } from '../../browser/services/notebookKernelServiceImpl.js';
import { NotebookViewModel } from '../../browser/viewModel/notebookViewModelImpl.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { CellEditType, CellKind, CellUri, IOutputDto, NotebookCellMetadata, NotebookExecutionState } from '../../common/notebookCommon.js';
import { CellExecutionUpdateType, INotebookExecutionService } from '../../common/notebookExecutionService.js';
import { INotebookExecutionStateService, NotebookExecutionType } from '../../common/notebookExecutionStateService.js';
import { INotebookKernel, INotebookKernelService, VariablesResult } from '../../common/notebookKernelService.js';
import { INotebookLoggingService } from '../../common/notebookLoggingService.js';
import { INotebookService } from '../../common/notebookService.js';
import { setupInstantiationService, withTestNotebook as _withTestNotebook } from './testNotebookEditor.js';

suite('NotebookExecutionStateService', () => {

	let instantiationService: TestInstantiationService;
	let kernelService: INotebookKernelService;
	let disposables: DisposableStore;
	let testNotebookModel: NotebookTextModel | undefined;

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
			override getNotebookTextModel(uri: URI): NotebookTextModel | undefined {
				return testNotebookModel;
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
		instantiationService.stub(INotebookLoggingService, new class extends mock<INotebookLoggingService>() {
			override debug(category: string, output: string): void {
				//
			}
		});

		kernelService = disposables.add(instantiationService.createInstance(NotebookKernelService));
		instantiationService.set(INotebookKernelService, kernelService);
		instantiationService.set(INotebookExecutionService, disposables.add(instantiationService.createInstance(NotebookExecutionService)));
		instantiationService.set(INotebookExecutionStateService, disposables.add(instantiationService.createInstance(NotebookExecutionStateService)));
	});

	async function withTestNotebook(cells: [string, string, CellKind, IOutputDto[], NotebookCellMetadata][], callback: (viewModel: NotebookViewModel, textModel: NotebookTextModel, disposables: DisposableStore) => void | Promise<void>) {
		return _withTestNotebook(cells, (editor, viewModel) => callback(viewModel, viewModel.notebookDocument, disposables));
	}

	function testCancelOnDelete(expectedCancels: number, implementsInterrupt: boolean) {
		return withTestNotebook([], async (viewModel, _document, disposables) => {
			testNotebookModel = viewModel.notebookDocument;

			let cancels = 0;
			const kernel = new class extends TestNotebookKernel {
				implementsInterrupt = implementsInterrupt;

				constructor() {
					super({ languages: ['javascript'] });
				}

				override async executeNotebookCellsRequest(): Promise<void> { }

				override async cancelNotebookCellExecution(_uri: URI, handles: number[]): Promise<void> {
					cancels += handles.length;
				}
			};
			disposables.add(kernelService.registerKernel(kernel));
			kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);

			const executionStateService: INotebookExecutionStateService = instantiationService.get(INotebookExecutionStateService);

			// Should cancel executing and pending cells, when kernel does not implement interrupt
			const cell = disposables.add(insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true));
			const cell2 = disposables.add(insertCellAtIndex(viewModel, 1, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true));
			const cell3 = disposables.add(insertCellAtIndex(viewModel, 2, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true));
			insertCellAtIndex(viewModel, 3, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true); // Not deleted
			const exe = executionStateService.createCellExecution(viewModel.uri, cell.handle); // Executing
			exe.confirm();
			exe.update([{ editType: CellExecutionUpdateType.ExecutionState, executionOrder: 1 }]);
			const exe2 = executionStateService.createCellExecution(viewModel.uri, cell2.handle); // Pending
			exe2.confirm();
			executionStateService.createCellExecution(viewModel.uri, cell3.handle); // Unconfirmed
			assert.strictEqual(cancels, 0);
			viewModel.notebookDocument.applyEdits([{
				editType: CellEditType.Replace, index: 0, count: 3, cells: []
			}], true, undefined, () => undefined, undefined, false);
			assert.strictEqual(cancels, expectedCancels);
		});

	}

	// TODO@roblou Could be a test just for NotebookExecutionListeners, which can be a standalone contribution
	test('cancel execution when cell is deleted', async function () {
		return testCancelOnDelete(3, false);
	});

	test('cancel execution when cell is deleted in interrupt-type kernel', async function () {
		return testCancelOnDelete(1, true);
	});

	test('fires onDidChangeCellExecution when cell is completed while deleted', async function () {
		return withTestNotebook([], async (viewModel, _document, disposables) => {
			testNotebookModel = viewModel.notebookDocument;

			const kernel = new TestNotebookKernel();
			disposables.add(kernelService.registerKernel(kernel));
			kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);

			const executionStateService: INotebookExecutionStateService = instantiationService.get(INotebookExecutionStateService);
			const cell = insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true);
			const exe = executionStateService.createCellExecution(viewModel.uri, cell.handle);

			let didFire = false;
			disposables.add(executionStateService.onDidChangeExecution(e => {
				if (e.type === NotebookExecutionType.cell) {
					didFire = !e.changed;
				}
			}));

			viewModel.notebookDocument.applyEdits([{
				editType: CellEditType.Replace, index: 0, count: 1, cells: []
			}], true, undefined, () => undefined, undefined, false);
			exe.complete({});
			assert.strictEqual(didFire, true);
		});
	});

	test('does not fire onDidChangeCellExecution for output updates', async function () {
		return withTestNotebook([], async (viewModel, _document, disposables) => {
			testNotebookModel = viewModel.notebookDocument;

			const kernel = new TestNotebookKernel();
			disposables.add(kernelService.registerKernel(kernel));
			kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);

			const executionStateService: INotebookExecutionStateService = instantiationService.get(INotebookExecutionStateService);
			const cell = disposables.add(insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true));
			const exe = executionStateService.createCellExecution(viewModel.uri, cell.handle);

			let didFire = false;
			disposables.add(executionStateService.onDidChangeExecution(e => {
				if (e.type === NotebookExecutionType.cell) {
					didFire = true;
				}
			}));

			exe.update([{ editType: CellExecutionUpdateType.OutputItems, items: [], outputId: '1' }]);
			assert.strictEqual(didFire, false);
			exe.update([{ editType: CellExecutionUpdateType.ExecutionState, executionOrder: 123 }]);
			assert.strictEqual(didFire, true);
			exe.complete({});
		});
	});

	// #142466
	test('getCellExecution and onDidChangeCellExecution', async function () {
		return withTestNotebook([], async (viewModel, _document, disposables) => {
			testNotebookModel = viewModel.notebookDocument;

			const kernel = new TestNotebookKernel();
			disposables.add(kernelService.registerKernel(kernel));
			kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);

			const executionStateService: INotebookExecutionStateService = instantiationService.get(INotebookExecutionStateService);
			const cell = disposables.add(insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true));

			const deferred = new DeferredPromise<void>();
			disposables.add(executionStateService.onDidChangeExecution(e => {
				if (e.type === NotebookExecutionType.cell) {
					const cellUri = CellUri.generate(e.notebook, e.cellHandle);
					const exe = executionStateService.getCellExecution(cellUri);
					assert.ok(exe);
					assert.strictEqual(e.notebook.toString(), exe.notebook.toString());
					assert.strictEqual(e.cellHandle, exe.cellHandle);

					assert.strictEqual(exe.notebook.toString(), e.changed?.notebook.toString());
					assert.strictEqual(exe.cellHandle, e.changed?.cellHandle);

					deferred.complete();
				}
			}));

			executionStateService.createCellExecution(viewModel.uri, cell.handle);

			return deferred.p;
		});
	});
	test('getExecution and onDidChangeExecution', async function () {
		return withTestNotebook([], async (viewModel, _document, disposables) => {
			testNotebookModel = viewModel.notebookDocument;

			const kernel = new TestNotebookKernel();
			disposables.add(kernelService.registerKernel(kernel));
			kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);

			const eventRaisedWithExecution: boolean[] = [];
			const executionStateService: INotebookExecutionStateService = instantiationService.get(INotebookExecutionStateService);
			executionStateService.onDidChangeExecution(e => eventRaisedWithExecution.push(e.type === NotebookExecutionType.notebook && !!e.changed), this, disposables);

			const deferred = new DeferredPromise<void>();
			disposables.add(executionStateService.onDidChangeExecution(e => {
				if (e.type === NotebookExecutionType.notebook) {
					const exe = executionStateService.getExecution(viewModel.uri);
					assert.ok(exe);
					assert.strictEqual(e.notebook.toString(), exe.notebook.toString());
					assert.ok(e.affectsNotebook(viewModel.uri));
					assert.deepStrictEqual(eventRaisedWithExecution, [true]);
					deferred.complete();
				}
			}));

			executionStateService.createExecution(viewModel.uri);

			return deferred.p;
		});
	});

	test('getExecution and onDidChangeExecution 2', async function () {
		return withTestNotebook([], async (viewModel, _document, disposables) => {
			testNotebookModel = viewModel.notebookDocument;

			const kernel = new TestNotebookKernel();
			disposables.add(kernelService.registerKernel(kernel));
			kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);

			const executionStateService: INotebookExecutionStateService = instantiationService.get(INotebookExecutionStateService);

			const deferred = new DeferredPromise<void>();
			const expectedNotebookEventStates: (NotebookExecutionState | undefined)[] = [NotebookExecutionState.Unconfirmed, NotebookExecutionState.Pending, NotebookExecutionState.Executing, undefined];
			executionStateService.onDidChangeExecution(e => {
				if (e.type === NotebookExecutionType.notebook) {
					const expectedState = expectedNotebookEventStates.shift();
					if (typeof expectedState === 'number') {
						const exe = executionStateService.getExecution(viewModel.uri);
						assert.ok(exe);
						assert.strictEqual(e.notebook.toString(), exe.notebook.toString());
						assert.strictEqual(e.changed?.state, expectedState);
					} else {
						assert.ok(e.changed === undefined);
					}

					assert.ok(e.affectsNotebook(viewModel.uri));
					if (expectedNotebookEventStates.length === 0) {
						deferred.complete();
					}
				}
			}, this, disposables);

			const execution = executionStateService.createExecution(viewModel.uri);
			execution.confirm();
			execution.begin();
			execution.complete();

			return deferred.p;
		});
	});

	test('force-cancel works for Cell Execution', async function () {
		return withTestNotebook([], async (viewModel, _document, disposables) => {
			testNotebookModel = viewModel.notebookDocument;

			const kernel = new TestNotebookKernel();
			disposables.add(kernelService.registerKernel(kernel));
			kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);

			const executionStateService: INotebookExecutionStateService = instantiationService.get(INotebookExecutionStateService);
			const cell = disposables.add(insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true));
			executionStateService.createCellExecution(viewModel.uri, cell.handle);
			const exe = executionStateService.getCellExecution(cell.uri);
			assert.ok(exe);

			executionStateService.forceCancelNotebookExecutions(viewModel.uri);
			const exe2 = executionStateService.getCellExecution(cell.uri);
			assert.strictEqual(exe2, undefined);
		});
	});
	test('force-cancel works for Notebook Execution', async function () {
		return withTestNotebook([], async (viewModel, _document, disposables) => {
			testNotebookModel = viewModel.notebookDocument;

			const kernel = new TestNotebookKernel();
			disposables.add(kernelService.registerKernel(kernel));
			kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);
			const eventRaisedWithExecution: boolean[] = [];

			const executionStateService: INotebookExecutionStateService = instantiationService.get(INotebookExecutionStateService);
			executionStateService.onDidChangeExecution(e => eventRaisedWithExecution.push(e.type === NotebookExecutionType.notebook && !!e.changed), this, disposables);
			executionStateService.createExecution(viewModel.uri);
			const exe = executionStateService.getExecution(viewModel.uri);
			assert.ok(exe);
			assert.deepStrictEqual(eventRaisedWithExecution, [true]);

			executionStateService.forceCancelNotebookExecutions(viewModel.uri);
			const exe2 = executionStateService.getExecution(viewModel.uri);
			assert.deepStrictEqual(eventRaisedWithExecution, [true, false]);
			assert.strictEqual(exe2, undefined);
		});
	});
	test('force-cancel works for Cell and Notebook Execution', async function () {
		return withTestNotebook([], async (viewModel, _document, disposables) => {
			testNotebookModel = viewModel.notebookDocument;

			const kernel = new TestNotebookKernel();
			disposables.add(kernelService.registerKernel(kernel));
			kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);

			const executionStateService: INotebookExecutionStateService = instantiationService.get(INotebookExecutionStateService);
			executionStateService.createExecution(viewModel.uri);
			executionStateService.createExecution(viewModel.uri);
			const cellExe = executionStateService.getExecution(viewModel.uri);
			const exe = executionStateService.getExecution(viewModel.uri);
			assert.ok(cellExe);
			assert.ok(exe);

			executionStateService.forceCancelNotebookExecutions(viewModel.uri);
			const cellExe2 = executionStateService.getExecution(viewModel.uri);
			const exe2 = executionStateService.getExecution(viewModel.uri);
			assert.strictEqual(cellExe2, undefined);
			assert.strictEqual(exe2, undefined);
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
	async executeNotebookCellsRequest(): Promise<void> { }
	async cancelNotebookCellExecution(uri: URI, cellHandles: number[]): Promise<void> { }
	provideVariables(notebookUri: URI, parentId: number | undefined, kind: 'named' | 'indexed', start: number, token: CancellationToken): AsyncIterableProducer<VariablesResult> {
		return AsyncIterableProducer.EMPTY;
	}

	constructor(opts?: { languages?: string[]; id?: string }) {
		this.supportedLanguages = opts?.languages ?? [PLAINTEXT_LANGUAGE_ID];
		if (opts?.id) {
			this.id = opts?.id;
		}
	}
}
