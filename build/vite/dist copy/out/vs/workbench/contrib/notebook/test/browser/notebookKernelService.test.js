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
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AsyncIterableProducer } from '../../../../../base/common/async.js';
suite('NotebookKernelService', () => {
    let instantiationService;
    let kernelService;
    let disposables;
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
    test('notebook priorities', function () {
        const u1 = URI.parse('foo:///one');
        const u2 = URI.parse('foo:///two');
        const k1 = new TestNotebookKernel({ label: 'z' });
        const k2 = new TestNotebookKernel({ label: 'a' });
        disposables.add(kernelService.registerKernel(k1));
        disposables.add(kernelService.registerKernel(k2));
        // equal priorities -> sort by name
        let info = kernelService.getMatchingKernel({ uri: u1, notebookType: 'foo' });
        assert.ok(info.all[0] === k2);
        assert.ok(info.all[1] === k1);
        // update priorities for u1 notebook
        kernelService.updateKernelNotebookAffinity(k2, u1, 2);
        kernelService.updateKernelNotebookAffinity(k2, u2, 1);
        // updated
        info = kernelService.getMatchingKernel({ uri: u1, notebookType: 'foo' });
        assert.ok(info.all[0] === k2);
        assert.ok(info.all[1] === k1);
        // NOT updated
        info = kernelService.getMatchingKernel({ uri: u2, notebookType: 'foo' });
        assert.ok(info.all[0] === k2);
        assert.ok(info.all[1] === k1);
        // reset
        kernelService.updateKernelNotebookAffinity(k2, u1, undefined);
        info = kernelService.getMatchingKernel({ uri: u1, notebookType: 'foo' });
        assert.ok(info.all[0] === k2);
        assert.ok(info.all[1] === k1);
    });
    test('new kernel with higher affinity wins, https://github.com/microsoft/vscode/issues/122028', function () {
        const notebook = URI.parse('foo:///one');
        const kernel = new TestNotebookKernel();
        disposables.add(kernelService.registerKernel(kernel));
        let info = kernelService.getMatchingKernel({ uri: notebook, notebookType: 'foo' });
        assert.strictEqual(info.all.length, 1);
        assert.ok(info.all[0] === kernel);
        const betterKernel = new TestNotebookKernel();
        disposables.add(kernelService.registerKernel(betterKernel));
        info = kernelService.getMatchingKernel({ uri: notebook, notebookType: 'foo' });
        assert.strictEqual(info.all.length, 2);
        kernelService.updateKernelNotebookAffinity(betterKernel, notebook, 2);
        info = kernelService.getMatchingKernel({ uri: notebook, notebookType: 'foo' });
        assert.strictEqual(info.all.length, 2);
        assert.ok(info.all[0] === betterKernel);
        assert.ok(info.all[1] === kernel);
    });
    test('onDidChangeSelectedNotebooks not fired on initial notebook open #121904', function () {
        const uri = URI.parse('foo:///one');
        const jupyter = { uri, viewType: 'jupyter', notebookType: 'jupyter' };
        const dotnet = { uri, viewType: 'dotnet', notebookType: 'dotnet' };
        const jupyterKernel = new TestNotebookKernel({ viewType: jupyter.viewType });
        const dotnetKernel = new TestNotebookKernel({ viewType: dotnet.viewType });
        disposables.add(kernelService.registerKernel(jupyterKernel));
        disposables.add(kernelService.registerKernel(dotnetKernel));
        kernelService.selectKernelForNotebook(jupyterKernel, jupyter);
        kernelService.selectKernelForNotebook(dotnetKernel, dotnet);
        let info = kernelService.getMatchingKernel(dotnet);
        assert.strictEqual(info.selected === dotnetKernel, true);
        info = kernelService.getMatchingKernel(jupyter);
        assert.strictEqual(info.selected === jupyterKernel, true);
    });
    test('onDidChangeSelectedNotebooks not fired on initial notebook open #121904, p2', async function () {
        const uri = URI.parse('foo:///one');
        const jupyter = { uri, viewType: 'jupyter', notebookType: 'jupyter' };
        const dotnet = { uri, viewType: 'dotnet', notebookType: 'dotnet' };
        const jupyterKernel = new TestNotebookKernel({ viewType: jupyter.viewType });
        const dotnetKernel = new TestNotebookKernel({ viewType: dotnet.viewType });
        disposables.add(kernelService.registerKernel(jupyterKernel));
        disposables.add(kernelService.registerKernel(dotnetKernel));
        kernelService.selectKernelForNotebook(jupyterKernel, jupyter);
        kernelService.selectKernelForNotebook(dotnetKernel, dotnet);
        const transientOptions = {
            transientOutputs: false,
            transientCellMetadata: {},
            transientDocumentMetadata: {},
            cellContentMetadata: {},
        };
        {
            // open as jupyter -> bind event
            const p1 = Event.toPromise(kernelService.onDidChangeSelectedNotebooks);
            const d1 = disposables.add(instantiationService.createInstance(NotebookTextModel, jupyter.viewType, jupyter.uri, [], {}, transientOptions));
            onDidAddNotebookDocument.fire(d1);
            const event = await p1;
            assert.strictEqual(event.newKernel, jupyterKernel.id);
        }
        {
            // RE-open as dotnet -> bind event
            const p2 = Event.toPromise(kernelService.onDidChangeSelectedNotebooks);
            const d2 = disposables.add(instantiationService.createInstance(NotebookTextModel, dotnet.viewType, dotnet.uri, [], {}, transientOptions));
            onDidAddNotebookDocument.fire(d2);
            const event2 = await p2;
            assert.strictEqual(event2.newKernel, dotnetKernel.id);
        }
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
        this.viewType = opts?.viewType ?? this.viewType;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tLZXJuZWxTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay90ZXN0L2Jyb3dzZXIvbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM5RixPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBbUIsc0JBQXNCLEVBQW1CLE1BQU0sdUNBQXVDLENBQUM7QUFDakgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDNUYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRS9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQVMsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFeEYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFNUUsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtJQUVuQyxJQUFJLG9CQUE4QyxDQUFDO0lBQ25ELElBQUksYUFBcUMsQ0FBQztJQUMxQyxJQUFJLFdBQTRCLENBQUM7SUFFakMsSUFBSSx3QkFBb0QsQ0FBQztJQUN6RCxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ2IsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3ZCLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUM7UUFDTCxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUVwQyx3QkFBd0IsR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQ3pDLFdBQVcsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUUxQyxvQkFBb0IsR0FBRyx5QkFBeUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM5RCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUFvQjtZQUF0Qzs7Z0JBQ3RDLDZCQUF3QixHQUFHLHdCQUF3QixDQUFDLEtBQUssQ0FBQztnQkFDMUQsaUNBQTRCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztZQUVwRCxDQUFDO1lBRFMscUJBQXFCLEtBQUssT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1NBQy9DLENBQUMsQ0FBQztRQUNILG9CQUFvQixDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUFnQjtZQUNwRSxVQUFVO2dCQUNsQixPQUFPLElBQUksS0FBTSxTQUFRLElBQUksRUFBUztvQkFBM0I7O3dCQUNELGdCQUFXLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztvQkFHbkMsQ0FBQztvQkFGUyxVQUFVLEtBQUssT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUMzQixPQUFPLEtBQUssQ0FBQztpQkFDdEIsQ0FBQztZQUNILENBQUM7U0FDRCxDQUFDLENBQUM7UUFDSCxhQUFhLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO1FBQzVGLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsRUFBRSxhQUFhLENBQUMsQ0FBQztJQUNqRSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxQkFBcUIsRUFBRTtRQUUzQixNQUFNLEVBQUUsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ25DLE1BQU0sRUFBRSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUM7UUFFbkMsTUFBTSxFQUFFLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ2xELE1BQU0sRUFBRSxHQUFHLElBQUksa0JBQWtCLENBQUMsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUVsRCxXQUFXLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRCxXQUFXLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVsRCxtQ0FBbUM7UUFDbkMsSUFBSSxJQUFJLEdBQUcsYUFBYSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUM3RSxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDOUIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBRTlCLG9DQUFvQztRQUNwQyxhQUFhLENBQUMsNEJBQTRCLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN0RCxhQUFhLENBQUMsNEJBQTRCLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV0RCxVQUFVO1FBQ1YsSUFBSSxHQUFHLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDekUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQzlCLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUU5QixjQUFjO1FBQ2QsSUFBSSxHQUFHLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDekUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQzlCLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUU5QixRQUFRO1FBQ1IsYUFBYSxDQUFDLDRCQUE0QixDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDOUQsSUFBSSxHQUFHLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDekUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQzlCLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUMvQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx5RkFBeUYsRUFBRTtRQUMvRixNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRXpDLE1BQU0sTUFBTSxHQUFHLElBQUksa0JBQWtCLEVBQUUsQ0FBQztRQUN4QyxXQUFXLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUV0RCxJQUFJLElBQUksR0FBRyxhQUFhLENBQUMsaUJBQWlCLENBQUMsRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ25GLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLE1BQU0sQ0FBQyxDQUFDO1FBRWxDLE1BQU0sWUFBWSxHQUFHLElBQUksa0JBQWtCLEVBQUUsQ0FBQztRQUM5QyxXQUFXLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUU1RCxJQUFJLEdBQUcsYUFBYSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUMvRSxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXZDLGFBQWEsQ0FBQyw0QkFBNEIsQ0FBQyxZQUFZLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3RFLElBQUksR0FBRyxhQUFhLENBQUMsaUJBQWlCLENBQUMsRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQy9FLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLFlBQVksQ0FBQyxDQUFDO1FBQ3hDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxNQUFNLENBQUMsQ0FBQztJQUNuQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx5RUFBeUUsRUFBRTtRQUUvRSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ3BDLE1BQU0sT0FBTyxHQUFHLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxDQUFDO1FBQ3RFLE1BQU0sTUFBTSxHQUFHLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLFFBQVEsRUFBRSxDQUFDO1FBRW5FLE1BQU0sYUFBYSxHQUFHLElBQUksa0JBQWtCLENBQUMsRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDN0UsTUFBTSxZQUFZLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQyxFQUFFLFFBQVEsRUFBRSxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUMzRSxXQUFXLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUM3RCxXQUFXLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUU1RCxhQUFhLENBQUMsdUJBQXVCLENBQUMsYUFBYSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzlELGFBQWEsQ0FBQyx1QkFBdUIsQ0FBQyxZQUFZLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFNUQsSUFBSSxJQUFJLEdBQUcsYUFBYSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ25ELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsS0FBSyxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFekQsSUFBSSxHQUFHLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNoRCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLEtBQUssYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzNELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDZFQUE2RSxFQUFFLEtBQUs7UUFFeEYsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNwQyxNQUFNLE9BQU8sR0FBRyxFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFlBQVksRUFBRSxTQUFTLEVBQUUsQ0FBQztRQUN0RSxNQUFNLE1BQU0sR0FBRyxFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsQ0FBQztRQUVuRSxNQUFNLGFBQWEsR0FBRyxJQUFJLGtCQUFrQixDQUFDLEVBQUUsUUFBUSxFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQzdFLE1BQU0sWUFBWSxHQUFHLElBQUksa0JBQWtCLENBQUMsRUFBRSxRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDM0UsV0FBVyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDN0QsV0FBVyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFFNUQsYUFBYSxDQUFDLHVCQUF1QixDQUFDLGFBQWEsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM5RCxhQUFhLENBQUMsdUJBQXVCLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRTVELE1BQU0sZ0JBQWdCLEdBQXFCO1lBQzFDLGdCQUFnQixFQUFFLEtBQUs7WUFDdkIscUJBQXFCLEVBQUUsRUFBRTtZQUN6Qix5QkFBeUIsRUFBRSxFQUFFO1lBQzdCLG1CQUFtQixFQUFFLEVBQUU7U0FDdkIsQ0FBQztRQUVGLENBQUM7WUFDQSxnQ0FBZ0M7WUFDaEMsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsNEJBQTRCLENBQUMsQ0FBQztZQUN2RSxNQUFNLEVBQUUsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxpQkFBaUIsRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7WUFDNUksd0JBQXdCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2xDLE1BQU0sS0FBSyxHQUFHLE1BQU0sRUFBRSxDQUFDO1lBQ3ZCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdkQsQ0FBQztRQUNELENBQUM7WUFDQSxrQ0FBa0M7WUFDbEMsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsNEJBQTRCLENBQUMsQ0FBQztZQUN2RSxNQUFNLEVBQUUsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxpQkFBaUIsRUFBRSxNQUFNLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxHQUFHLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7WUFDMUksd0JBQXdCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2xDLE1BQU0sTUFBTSxHQUFHLE1BQU0sRUFBRSxDQUFDO1lBQ3hCLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdkQsQ0FBQztJQUNGLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUM7QUFFSCxNQUFNLGtCQUFrQjtJQVl2QiwyQkFBMkI7UUFDMUIsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFDRCwyQkFBMkI7UUFDMUIsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFDRCxnQkFBZ0IsQ0FBQyxXQUFnQixFQUFFLFFBQTRCLEVBQUUsSUFBeUIsRUFBRSxLQUFhLEVBQUUsS0FBd0I7UUFDbEksT0FBTyxxQkFBcUIsQ0FBQyxLQUFLLENBQUM7SUFDcEMsQ0FBQztJQUVELFlBQVksSUFBa0U7UUFyQjlFLE9BQUUsR0FBVyxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsUUFBUSxDQUFDO1FBQ3RDLFVBQUssR0FBVyxZQUFZLENBQUM7UUFDN0IsYUFBUSxHQUFHLEdBQUcsQ0FBQztRQUNmLGdCQUFXLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN6QixjQUFTLEdBQXdCLElBQUksbUJBQW1CLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDakUsc0JBQWlCLEdBQVEsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUczQyxnQkFBVyxHQUFVLEVBQUUsQ0FBQztRQUN4QixvQkFBZSxHQUFhLEVBQUUsQ0FBQztRQUMvQix1QkFBa0IsR0FBYSxFQUFFLENBQUM7UUFZakMsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksRUFBRSxTQUFTLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxFQUFFLEtBQUssSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxFQUFFLFFBQVEsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ2pELENBQUM7Q0FDRCJ9