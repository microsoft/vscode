/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../../base/common/mime.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { CellKind, NotebookSetting } from '../../common/notebookCommon.js';
import { NotebookFileWorkingCopyModel } from '../../common/notebookEditorModel.js';
import { SimpleNotebookProviderInfo } from '../../common/notebookService.js';
import { setupInstantiationService } from './testNotebookEditor.js';
suite('NotebookFileWorkingCopyModel', function () {
    let disposables;
    let instantiationService;
    const configurationService = new TestConfigurationService();
    const telemetryService = new class extends mock() {
        publicLogError2() { }
    };
    const logservice = new class extends mock() {
    };
    teardown(() => disposables.dispose());
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        disposables = new DisposableStore();
        instantiationService = setupInstantiationService(disposables);
    });
    test('no transient output is send to serializer', async function () {
        const notebook = instantiationService.createInstance(NotebookTextModel, 'notebook', URI.file('test'), [{ cellKind: CellKind.Code, language: 'foo', mime: 'foo', source: 'foo', outputs: [{ outputId: 'id', outputs: [{ mime: Mimes.text, data: VSBuffer.fromString('Hello Out') }] }] }], {}, { transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false });
        { // transient output
            let callCount = 0;
            const model = disposables.add(new NotebookFileWorkingCopyModel(notebook, mockNotebookService(notebook, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.options = { transientOutputs: true, transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {} };
                }
                async notebookToData(notebook) {
                    callCount += 1;
                    assert.strictEqual(notebook.cells.length, 1);
                    assert.strictEqual(notebook.cells[0].outputs.length, 0);
                    return VSBuffer.fromString('');
                }
            }), configurationService, telemetryService, logservice));
            await model.snapshot(1 /* SnapshotContext.Save */, CancellationToken.None);
            assert.strictEqual(callCount, 1);
        }
        { // NOT transient output
            let callCount = 0;
            const model = disposables.add(new NotebookFileWorkingCopyModel(notebook, mockNotebookService(notebook, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.options = { transientOutputs: false, transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {} };
                }
                async notebookToData(notebook) {
                    callCount += 1;
                    assert.strictEqual(notebook.cells.length, 1);
                    assert.strictEqual(notebook.cells[0].outputs.length, 1);
                    return VSBuffer.fromString('');
                }
            }), configurationService, telemetryService, logservice));
            await model.snapshot(1 /* SnapshotContext.Save */, CancellationToken.None);
            assert.strictEqual(callCount, 1);
        }
    });
    test('no transient metadata is send to serializer', async function () {
        const notebook = instantiationService.createInstance(NotebookTextModel, 'notebook', URI.file('test'), [{ cellKind: CellKind.Code, language: 'foo', mime: 'foo', source: 'foo', outputs: [] }], { foo: 123, bar: 456 }, { transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false });
        disposables.add(notebook);
        { // transient
            let callCount = 0;
            const model = disposables.add(new NotebookFileWorkingCopyModel(notebook, mockNotebookService(notebook, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.options = { transientOutputs: true, transientCellMetadata: {}, transientDocumentMetadata: { bar: true }, cellContentMetadata: {} };
                }
                async notebookToData(notebook) {
                    callCount += 1;
                    assert.strictEqual(notebook.metadata.foo, 123);
                    assert.strictEqual(notebook.metadata.bar, undefined);
                    return VSBuffer.fromString('');
                }
            }), configurationService, telemetryService, logservice));
            await model.snapshot(1 /* SnapshotContext.Save */, CancellationToken.None);
            assert.strictEqual(callCount, 1);
        }
        { // NOT transient
            let callCount = 0;
            const model = disposables.add(new NotebookFileWorkingCopyModel(notebook, mockNotebookService(notebook, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.options = { transientOutputs: false, transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {} };
                }
                async notebookToData(notebook) {
                    callCount += 1;
                    assert.strictEqual(notebook.metadata.foo, 123);
                    assert.strictEqual(notebook.metadata.bar, 456);
                    return VSBuffer.fromString('');
                }
            }), configurationService, telemetryService, logservice));
            await model.snapshot(1 /* SnapshotContext.Save */, CancellationToken.None);
            assert.strictEqual(callCount, 1);
        }
    });
    test('no transient cell metadata is send to serializer', async function () {
        const notebook = instantiationService.createInstance(NotebookTextModel, 'notebook', URI.file('test'), [{ cellKind: CellKind.Code, language: 'foo', mime: 'foo', source: 'foo', outputs: [], metadata: { foo: 123, bar: 456 } }], {}, { transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false, });
        disposables.add(notebook);
        { // transient
            let callCount = 0;
            const model = disposables.add(new NotebookFileWorkingCopyModel(notebook, mockNotebookService(notebook, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.options = { transientOutputs: true, transientDocumentMetadata: {}, transientCellMetadata: { bar: true }, cellContentMetadata: {} };
                }
                async notebookToData(notebook) {
                    callCount += 1;
                    assert.strictEqual(notebook.cells[0].metadata.foo, 123);
                    assert.strictEqual(notebook.cells[0].metadata.bar, undefined);
                    return VSBuffer.fromString('');
                }
            }), configurationService, telemetryService, logservice));
            await model.snapshot(1 /* SnapshotContext.Save */, CancellationToken.None);
            assert.strictEqual(callCount, 1);
        }
        { // NOT transient
            let callCount = 0;
            const model = disposables.add(new NotebookFileWorkingCopyModel(notebook, mockNotebookService(notebook, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.options = { transientOutputs: false, transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {} };
                }
                async notebookToData(notebook) {
                    callCount += 1;
                    assert.strictEqual(notebook.cells[0].metadata.foo, 123);
                    assert.strictEqual(notebook.cells[0].metadata.bar, 456);
                    return VSBuffer.fromString('');
                }
            }), configurationService, telemetryService, logservice));
            await model.snapshot(1 /* SnapshotContext.Save */, CancellationToken.None);
            assert.strictEqual(callCount, 1);
        }
    });
    test('Notebooks with outputs beyond the size threshold will throw for backup snapshots', async function () {
        const outputLimit = 100;
        await configurationService.setUserConfiguration(NotebookSetting.outputBackupSizeLimit, outputLimit * 1.0 / 1024);
        const largeOutput = { outputId: '123', outputs: [{ mime: Mimes.text, data: VSBuffer.fromString('a'.repeat(outputLimit + 1)) }] };
        const notebook = instantiationService.createInstance(NotebookTextModel, 'notebook', URI.file('test'), [{ cellKind: CellKind.Code, language: 'foo', mime: 'foo', source: 'foo', outputs: [largeOutput], metadata: { foo: 123, bar: 456 } }], {}, { transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false, });
        disposables.add(notebook);
        let callCount = 0;
        const model = disposables.add(new NotebookFileWorkingCopyModel(notebook, mockNotebookService(notebook, new class extends mock() {
            constructor() {
                super(...arguments);
                this.options = { transientOutputs: true, transientDocumentMetadata: {}, transientCellMetadata: { bar: true }, cellContentMetadata: {} };
            }
            async notebookToData(notebook) {
                callCount += 1;
                assert.strictEqual(notebook.cells[0].metadata.foo, 123);
                assert.strictEqual(notebook.cells[0].metadata.bar, undefined);
                return VSBuffer.fromString('');
            }
        }, configurationService), configurationService, telemetryService, logservice));
        try {
            await model.snapshot(2 /* SnapshotContext.Backup */, CancellationToken.None);
            assert.fail('Expected snapshot to throw an error for large output');
        }
        catch (e) {
            assert.notEqual(e.code, 'ERR_ASSERTION', e.message);
        }
        await model.snapshot(1 /* SnapshotContext.Save */, CancellationToken.None);
        assert.strictEqual(callCount, 1);
    });
    test('Notebook model will not return a save delegate if the serializer has not been retreived', async function () {
        const notebook = instantiationService.createInstance(NotebookTextModel, 'notebook', URI.file('test'), [{ cellKind: CellKind.Code, language: 'foo', mime: 'foo', source: 'foo', outputs: [], metadata: { foo: 123, bar: 456 } }], {}, { transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false, });
        disposables.add(notebook);
        const serializer = new class extends mock() {
            save() {
                return Promise.resolve({ name: 'savedFile' });
            }
        };
        let resolveSerializer = () => { };
        const serializerPromise = new Promise(resolve => {
            resolveSerializer = resolve;
        });
        const notebookService = mockNotebookService(notebook, serializerPromise);
        configurationService.setUserConfiguration(NotebookSetting.remoteSaving, true);
        const model = disposables.add(new NotebookFileWorkingCopyModel(notebook, notebookService, configurationService, telemetryService, logservice));
        // the save method should not be set if the serializer is not yet resolved
        const notExist = model.save;
        assert.strictEqual(notExist, undefined);
        resolveSerializer(serializer);
        await model.getNotebookSerializer();
        const result = await model.save?.({}, {});
        assert.strictEqual(result.name, 'savedFile');
    });
});
function mockNotebookService(notebook, notebookSerializer, configurationService = new TestConfigurationService()) {
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.serializer = undefined;
        }
        async withNotebookDataProvider(viewType) {
            this.serializer = await notebookSerializer;
            return new SimpleNotebookProviderInfo(notebook.viewType, this.serializer, {
                id: new ExtensionIdentifier('test'),
                location: undefined
            });
        }
        tryGetDataProviderSync(viewType) {
            if (!this.serializer) {
                return undefined;
            }
            return new SimpleNotebookProviderInfo(notebook.viewType, this.serializer, {
                id: new ExtensionIdentifier('test'),
                location: undefined
            });
        }
        async createNotebookTextDocumentSnapshot(uri, context, token) {
            const info = await this.withNotebookDataProvider(notebook.viewType);
            const serializer = info.serializer;
            const outputSizeLimit = configurationService.getValue(NotebookSetting.outputBackupSizeLimit) ?? 1024;
            const data = notebook.createSnapshot({ context: context, outputSizeLimit: outputSizeLimit, transientOptions: serializer.options });
            const bytes = await serializer.notebookToData(data);
            return bufferToStream(bytes);
        }
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tFZGl0b3JNb2RlbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svdGVzdC9icm93c2VyL25vdGVib29rRWRpdG9yTW9kZWwudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGNBQWMsRUFBRSxRQUFRLEVBQTBCLE1BQU0sc0NBQXNDLENBQUM7QUFDeEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBSzlGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxRQUFRLEVBQTRCLGVBQWUsRUFBb0IsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN2SCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNuRixPQUFPLEVBQXlDLDBCQUEwQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDcEgsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0seUJBQXlCLENBQUM7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