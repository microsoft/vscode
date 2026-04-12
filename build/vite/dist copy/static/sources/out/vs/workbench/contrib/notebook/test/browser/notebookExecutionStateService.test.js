/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { AsyncIterableProducer, DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { insertCellAtIndex } from '../../browser/controller/cellOperations.js';
import { NotebookExecutionService } from '../../browser/services/notebookExecutionServiceImpl.js';
import { NotebookExecutionStateService } from '../../browser/services/notebookExecutionStateServiceImpl.js';
import { NotebookKernelService } from '../../browser/services/notebookKernelServiceImpl.js';
import { CellKind, CellUri, NotebookExecutionState } from '../../common/notebookCommon.js';
import { CellExecutionUpdateType, INotebookExecutionService } from '../../common/notebookExecutionService.js';
import { INotebookExecutionStateService, NotebookExecutionType } from '../../common/notebookExecutionStateService.js';
import { INotebookKernelService } from '../../common/notebookKernelService.js';
import { INotebookLoggingService } from '../../common/notebookLoggingService.js';
import { INotebookService } from '../../common/notebookService.js';
import { setupInstantiationService, withTestNotebook as _withTestNotebook } from './testNotebookEditor.js';
suite('NotebookExecutionStateService', () => {
    let instantiationService;
    let kernelService;
    let disposables;
    let testNotebookModel;
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(function () {
        disposables = new DisposableStore();
        instantiationService = setupInstantiationService(disposables);
        instantiationService.stub(INotebookService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidAddNotebookDocument = Event.None;
                this.onWillRemoveNotebookDocument = Event.None;
            }
            getNotebookTextModels() { return []; }
            getNotebookTextModel(uri) {
                return testNotebookModel;
            }
        });
        instantiationService.stub(IMenuService, new class extends mock() {
            createMenu() {
                return new class extends mock() {
                    constructor() {
                        super(...arguments);
                        this.onDidChange = Event.None;
                    }
                    getActions() { return []; }
                    dispose() { }
                };
            }
        });
        instantiationService.stub(INotebookLoggingService, new class extends mock() {
            debug(category, output) {
                //
            }
        });
        kernelService = disposables.add(instantiationService.createInstance(NotebookKernelService));
        instantiationService.set(INotebookKernelService, kernelService);
        instantiationService.set(INotebookExecutionService, disposables.add(instantiationService.createInstance(NotebookExecutionService)));
        instantiationService.set(INotebookExecutionStateService, disposables.add(instantiationService.createInstance(NotebookExecutionStateService)));
    });
    async function withTestNotebook(cells, callback) {
        return _withTestNotebook(cells, (editor, viewModel) => callback(viewModel, viewModel.notebookDocument, disposables));
    }
    function testCancelOnDelete(expectedCancels, implementsInterrupt) {
        return withTestNotebook([], async (viewModel, _document, disposables) => {
            testNotebookModel = viewModel.notebookDocument;
            let cancels = 0;
            const kernel = new class extends TestNotebookKernel {
                constructor() {
                    super({ languages: ['javascript'] });
                    this.implementsInterrupt = implementsInterrupt;
                }
                async executeNotebookCellsRequest() { }
                async cancelNotebookCellExecution(_uri, handles) {
                    cancels += handles.length;
                }
            };
            disposables.add(kernelService.registerKernel(kernel));
            kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);
            const executionStateService = instantiationService.get(INotebookExecutionStateService);
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
                    editType: 1 /* CellEditType.Replace */, index: 0, count: 3, cells: []
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
            const executionStateService = instantiationService.get(INotebookExecutionStateService);
            const cell = insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true);
            const exe = executionStateService.createCellExecution(viewModel.uri, cell.handle);
            let didFire = false;
            disposables.add(executionStateService.onDidChangeExecution(e => {
                if (e.type === NotebookExecutionType.cell) {
                    didFire = !e.changed;
                }
            }));
            viewModel.notebookDocument.applyEdits([{
                    editType: 1 /* CellEditType.Replace */, index: 0, count: 1, cells: []
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
            const executionStateService = instantiationService.get(INotebookExecutionStateService);
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
            const executionStateService = instantiationService.get(INotebookExecutionStateService);
            const cell = disposables.add(insertCellAtIndex(viewModel, 0, 'var c = 3', 'javascript', CellKind.Code, {}, [], true, true));
            const deferred = new DeferredPromise();
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
            const eventRaisedWithExecution = [];
            const executionStateService = instantiationService.get(INotebookExecutionStateService);
            executionStateService.onDidChangeExecution(e => eventRaisedWithExecution.push(e.type === NotebookExecutionType.notebook && !!e.changed), this, disposables);
            const deferred = new DeferredPromise();
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
            const executionStateService = instantiationService.get(INotebookExecutionStateService);
            const deferred = new DeferredPromise();
            const expectedNotebookEventStates = [NotebookExecutionState.Unconfirmed, NotebookExecutionState.Pending, NotebookExecutionState.Executing, undefined];
            executionStateService.onDidChangeExecution(e => {
                if (e.type === NotebookExecutionType.notebook) {
                    const expectedState = expectedNotebookEventStates.shift();
                    if (typeof expectedState === 'number') {
                        const exe = executionStateService.getExecution(viewModel.uri);
                        assert.ok(exe);
                        assert.strictEqual(e.notebook.toString(), exe.notebook.toString());
                        assert.strictEqual(e.changed?.state, expectedState);
                    }
                    else {
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
            const executionStateService = instantiationService.get(INotebookExecutionStateService);
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
            const eventRaisedWithExecution = [];
            const executionStateService = instantiationService.get(INotebookExecutionStateService);
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
            const executionStateService = instantiationService.get(INotebookExecutionStateService);
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
class TestNotebookKernel {
    async executeNotebookCellsRequest() { }
    async cancelNotebookCellExecution(uri, cellHandles) { }
    provideVariables(notebookUri, parentId, kind, start, token) {
        return AsyncIterableProducer.EMPTY;
    }
    constructor(opts) {
        this.id = 'test';
        this.label = '';
        this.viewType = '*';
        this.onDidChange = Event.None;
        this.extension = new ExtensionIdentifier('test');
        this.localResourceRoot = URI.file('/test');
        this.preloadUris = [];
        this.preloadProvides = [];
        this.supportedLanguages = [];
        this.supportedLanguages = opts?.languages ?? [PLAINTEXT_LANGUAGE_ID];
        if (opts?.id) {
            this.id = opts?.id;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL3Rlc3QvYnJvd3Nlci9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUscUJBQXFCLEVBQUUsZUFBZSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFN0YsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBUyxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUU5RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUM1RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUc1RixPQUFPLEVBQWdCLFFBQVEsRUFBRSxPQUFPLEVBQW9D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