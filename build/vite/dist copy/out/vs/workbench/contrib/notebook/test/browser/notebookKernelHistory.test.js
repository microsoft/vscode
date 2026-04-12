/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { setupInstantiationService } from './testNotebookEditor.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { INotebookKernelService } from '../../common/notebookKernelService.js';
import { NotebookKernelService } from '../../browser/services/notebookKernelServiceImpl.js';
import { INotebookService } from '../../common/notebookService.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { NotebookKernelHistoryService } from '../../browser/services/notebookKernelHistoryServiceImpl.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { INotebookLoggingService } from '../../common/notebookLoggingService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AsyncIterableProducer } from '../../../../../base/common/async.js';
suite('NotebookKernelHistoryService', () => {
    let disposables;
    let instantiationService;
    let kernelService;
    let onDidAddNotebookDocument;
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(function () {
        disposables = new DisposableStore();
        onDidAddNotebookDocument = new Emitter();
        disposables.add(onDidAddNotebookDocument);
        instantiationService = setupInstantiationService(disposables);
        instantiationService.stub(INotebookService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidAddNotebookDocument = onDidAddNotebookDocument.event;
                this.onWillRemoveNotebookDocument = Event.None;
            }
            getNotebookTextModels() { return []; }
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
        kernelService = disposables.add(instantiationService.createInstance(NotebookKernelService));
        instantiationService.set(INotebookKernelService, kernelService);
    });
    test('notebook kernel empty history', function () {
        const u1 = URI.parse('foo:///one');
        const k1 = new TestNotebookKernel({ label: 'z', notebookType: 'foo' });
        const k2 = new TestNotebookKernel({ label: 'a', notebookType: 'foo' });
        disposables.add(kernelService.registerKernel(k1));
        disposables.add(kernelService.registerKernel(k2));
        instantiationService.stub(IStorageService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onWillSaveState = Event.None;
            }
            onDidChangeValue(scope, key, disposable) {
                return Event.None;
            }
            get(key, scope, fallbackValue) {
                if (key === 'notebook.kernelHistory') {
                    return JSON.stringify({
                        'foo': {
                            'entries': []
                        }
                    });
                }
                return undefined;
            }
        });
        instantiationService.stub(INotebookLoggingService, new class extends mock() {
            info() { }
            debug() { }
        });
        const kernelHistoryService = disposables.add(instantiationService.createInstance(NotebookKernelHistoryService));
        let info = kernelHistoryService.getKernels({ uri: u1, notebookType: 'foo' });
        assert.equal(info.all.length, 0);
        assert.ok(!info.selected);
        // update priorities for u1 notebook
        kernelService.updateKernelNotebookAffinity(k2, u1, 2);
        info = kernelHistoryService.getKernels({ uri: u1, notebookType: 'foo' });
        assert.equal(info.all.length, 0);
        // MRU only auto selects kernel if there is only one
        assert.deepStrictEqual(info.selected, undefined);
    });
    test('notebook kernel history restore', function () {
        const u1 = URI.parse('foo:///one');
        const k1 = new TestNotebookKernel({ label: 'z', notebookType: 'foo' });
        const k2 = new TestNotebookKernel({ label: 'a', notebookType: 'foo' });
        const k3 = new TestNotebookKernel({ label: 'b', notebookType: 'foo' });
        disposables.add(kernelService.registerKernel(k1));
        disposables.add(kernelService.registerKernel(k2));
        disposables.add(kernelService.registerKernel(k3));
        instantiationService.stub(IStorageService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onWillSaveState = Event.None;
            }
            onDidChangeValue(scope, key, disposable) {
                return Event.None;
            }
            get(key, scope, fallbackValue) {
                if (key === 'notebook.kernelHistory') {
                    return JSON.stringify({
                        'foo': {
                            'entries': [
                                k2.id
                            ]
                        }
                    });
                }
                return undefined;
            }
        });
        instantiationService.stub(INotebookLoggingService, new class extends mock() {
            info() { }
            debug() { }
        });
        const kernelHistoryService = disposables.add(instantiationService.createInstance(NotebookKernelHistoryService));
        let info = kernelHistoryService.getKernels({ uri: u1, notebookType: 'foo' });
        assert.equal(info.all.length, 1);
        assert.deepStrictEqual(info.selected, undefined);
        kernelHistoryService.addMostRecentKernel(k3);
        info = kernelHistoryService.getKernels({ uri: u1, notebookType: 'foo' });
        assert.deepStrictEqual(info.all, [k3, k2]);
    });
});
class TestNotebookKernel {
    executeNotebookCellsRequest() {
        throw new Error('Method not implemented.');
    }
    cancelNotebookCellExecution() {
        throw new Error('Method not implemented.');
    }
    provideVariables(notebookUri, parentId, kind, start, token) {
        return AsyncIterableProducer.EMPTY;
    }
    constructor(opts) {
        this.id = Math.random() + 'kernel';
        this.label = 'test-label';
        this.viewType = '*';
        this.onDidChange = Event.None;
        this.extension = new ExtensionIdentifier('test');
        this.localResourceRoot = URI.file('/test');
        this.preloadUris = [];
        this.preloadProvides = [];
        this.supportedLanguages = [];
        this.supportedLanguages = opts?.languages ?? [PLAINTEXT_LANGUAGE_ID];
        this.label = opts?.label ?? this.label;
        this.viewType = opts?.notebookType ?? this.viewType;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tLZXJuZWxIaXN0b3J5LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay90ZXN0L2Jyb3dzZXIvbm90ZWJvb2tLZXJuZWxIaXN0b3J5LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM5RixPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBbUIsc0JBQXNCLEVBQW1CLE1BQU0sdUNBQXVDLENBQUM7QUFDakgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDNUYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRS9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUUxRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQVMsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDeEYsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDMUcsT0FBTyxFQUF3RSxlQUFlLEVBQWtHLE1BQU0sbURBQW1ELENBQUM7QUFDMVAsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakYs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