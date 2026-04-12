/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, ImmortalReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IBulkEditService } from '../../../../editor/browser/services/bulkEditService.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ILanguageConfigurationService } from '../../../../editor/common/languages/languageConfigurationRegistry.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { LanguageService } from '../../../../editor/common/services/languageService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ModelService } from '../../../../editor/common/services/modelService.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITreeSitterLibraryService } from '../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { TestCodeEditorService } from '../../../../editor/test/browser/editorTestServices.js';
import { TestLanguageConfigurationService } from '../../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { TestTreeSitterLibraryService } from '../../../../editor/test/common/services/testTreeSitterLibraryService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../platform/dialogs/test/common/testDialogService.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationService } from '../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../platform/notification/test/common/testNotificationService.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { UndoRedoService } from '../../../../platform/undoRedo/common/undoRedoService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { BulkEditService } from '../../../contrib/bulkEdit/browser/bulkEditService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';
import { LabelService } from '../../../services/label/common/labelService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IWorkingCopyFileService } from '../../../services/workingCopy/common/workingCopyFileService.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { TestEditorGroupsService, TestEditorService, TestEnvironmentService, TestLifecycleService, TestWorkingCopyService } from '../../../test/browser/workbenchTestServices.js';
import { TestContextService, TestFileService, TestTextResourcePropertiesService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadBulkEdits } from '../../browser/mainThreadBulkEdits.js';
import { MainThreadTextEditors } from '../../browser/mainThreadEditors.js';
import { MainThreadTextEditor } from '../../browser/mainThreadEditor.js';
import { MainThreadDocuments } from '../../browser/mainThreadDocuments.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { ITextResourcePropertiesService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../platform/clipboard/test/common/testClipboardService.js';
import { createTestCodeEditor } from '../../../../editor/test/browser/testCodeEditor.js';
suite('MainThreadEditors', () => {
    let disposables;
    const existingResource = URI.parse('foo:existing');
    const resource = URI.parse('foo:bar');
    let modelService;
    let bulkEdits;
    let editors;
    let editorLocator;
    let testEditor;
    const movedResources = new Map();
    const copiedResources = new Map();
    const createdResources = new Set();
    const deletedResources = new Set();
    const editorId = 'testEditorId';
    setup(() => {
        disposables = new DisposableStore();
        movedResources.clear();
        copiedResources.clear();
        createdResources.clear();
        deletedResources.clear();
        const configService = new TestConfigurationService();
        const dialogService = new TestDialogService();
        const notificationService = new TestNotificationService();
        const undoRedoService = new UndoRedoService(dialogService, notificationService);
        const themeService = new TestThemeService();
        const services = new ServiceCollection();
        services.set(IBulkEditService, new SyncDescriptor(BulkEditService));
        services.set(ILabelService, new SyncDescriptor(LabelService));
        services.set(ILogService, new NullLogService());
        services.set(IWorkspaceContextService, new TestContextService());
        services.set(IEnvironmentService, TestEnvironmentService);
        services.set(IWorkbenchEnvironmentService, TestEnvironmentService);
        services.set(IConfigurationService, configService);
        services.set(IDialogService, dialogService);
        services.set(INotificationService, notificationService);
        services.set(IUndoRedoService, undoRedoService);
        services.set(ITextResourcePropertiesService, new SyncDescriptor(TestTextResourcePropertiesService));
        services.set(IModelService, new SyncDescriptor(ModelService));
        services.set(ICodeEditorService, new TestCodeEditorService(themeService));
        services.set(IFileService, new TestFileService());
        services.set(IUriIdentityService, new SyncDescriptor(UriIdentityService));
        services.set(ITreeSitterLibraryService, new TestTreeSitterLibraryService());
        services.set(IEditorService, disposables.add(new TestEditorService()));
        services.set(ILifecycleService, new TestLifecycleService());
        services.set(IWorkingCopyService, new TestWorkingCopyService());
        services.set(IEditorGroupsService, new TestEditorGroupsService());
        services.set(IClipboardService, new TestClipboardService());
        services.set(ITextFileService, new class extends mock() {
            constructor() {
                super(...arguments);
                // eslint-disable-next-line local/code-no-any-casts
                this.files = {
                    onDidSave: Event.None,
                    onDidRevert: Event.None,
                    onDidChangeDirty: Event.None,
                    onDidChangeEncoding: Event.None
                };
                // eslint-disable-next-line local/code-no-any-casts
                this.untitled = {
                    onDidChangeEncoding: Event.None
                };
            }
            isDirty() { return false; }
            create(operations) {
                for (const o of operations) {
                    createdResources.add(o.resource);
                }
                return Promise.resolve(Object.create(null));
            }
            async getEncodedReadable(resource, value) {
                return undefined;
            }
        });
        services.set(IWorkingCopyFileService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidRunWorkingCopyFileOperation = Event.None;
            }
            createFolder(operations) {
                this.create(operations);
            }
            create(operations) {
                for (const operation of operations) {
                    createdResources.add(operation.resource);
                }
                return Promise.resolve(Object.create(null));
            }
            move(operations) {
                const { source, target } = operations[0].file;
                movedResources.set(source, target);
                return Promise.resolve(Object.create(null));
            }
            copy(operations) {
                const { source, target } = operations[0].file;
                copiedResources.set(source, target);
                return Promise.resolve(Object.create(null));
            }
            delete(operations) {
                for (const operation of operations) {
                    deletedResources.add(operation.resource);
                }
                return Promise.resolve(undefined);
            }
        });
        services.set(ITextModelService, new class extends mock() {
            createModelReference(resource) {
                const textEditorModel = new class extends mock() {
                    constructor() {
                        super(...arguments);
                        this.textEditorModel = modelService.getModel(resource);
                    }
                };
                textEditorModel.isReadonly = () => false;
                return Promise.resolve(new ImmortalReference(textEditorModel));
            }
        });
        services.set(IEditorWorkerService, new class extends mock() {
        });
        services.set(IPaneCompositePartService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidPaneCompositeOpen = Event.None;
                this.onDidPaneCompositeClose = Event.None;
            }
            getActivePaneComposite() {
                return undefined;
            }
        });
        services.set(ILanguageService, disposables.add(new LanguageService()));
        services.set(ILanguageConfigurationService, new TestLanguageConfigurationService());
        const instaService = new InstantiationService(services);
        bulkEdits = instaService.createInstance(MainThreadBulkEdits, SingleProxyRPCProtocol(null));
        const documents = instaService.createInstance(MainThreadDocuments, SingleProxyRPCProtocol(null));
        // Create editor locator
        editorLocator = {
            getEditor(id) {
                return id === editorId ? testEditor : undefined;
            },
            findTextEditorIdFor() { return undefined; },
            getIdOfCodeEditor() { return undefined; }
        };
        editors = instaService.createInstance(MainThreadTextEditors, editorLocator, SingleProxyRPCProtocol(null));
        modelService = instaService.invokeFunction(accessor => accessor.get(IModelService));
        // Create a test code editor using the helper
        const model = modelService.createModel('Hello world!', null, existingResource);
        const testCodeEditor = disposables.add(createTestCodeEditor(model));
        testEditor = disposables.add(instaService.createInstance(MainThreadTextEditor, editorId, model, testCodeEditor, { onGainedFocus() { }, onLostFocus() { } }, documents));
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test(`applyWorkspaceEdit returns false if model is changed by user`, () => {
        const model = disposables.add(modelService.createModel('something', null, resource));
        const workspaceResourceEdit = {
            resource: resource,
            versionId: model.getVersionId(),
            textEdit: {
                text: 'asdfg',
                range: new Range(1, 1, 1, 1)
            }
        };
        // Act as if the user edited the model
        model.applyEdits([EditOperation.insert(new Position(0, 0), 'something')]);
        return bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [workspaceResourceEdit] })).then((result) => {
            assert.strictEqual(result, false);
        });
    });
    test(`issue #54773: applyWorkspaceEdit checks model version in race situation`, () => {
        const model = disposables.add(modelService.createModel('something', null, resource));
        const workspaceResourceEdit1 = {
            resource: resource,
            versionId: model.getVersionId(),
            textEdit: {
                text: 'asdfg',
                range: new Range(1, 1, 1, 1)
            }
        };
        const workspaceResourceEdit2 = {
            resource: resource,
            versionId: model.getVersionId(),
            textEdit: {
                text: 'asdfg',
                range: new Range(1, 1, 1, 1)
            }
        };
        const p1 = bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [workspaceResourceEdit1] })).then((result) => {
            // first edit request succeeds
            assert.strictEqual(result, true);
        });
        const p2 = bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [workspaceResourceEdit2] })).then((result) => {
            // second edit request fails
            assert.strictEqual(result, false);
        });
        return Promise.all([p1, p2]);
    });
    test('applyWorkspaceEdit: noop eol edit keeps undo stack clean', async () => {
        const initialText = 'hello\nworld';
        const model = disposables.add(modelService.createModel(initialText, null, resource));
        const initialAlternativeVersionId = model.getAlternativeVersionId();
        const insertEdit = {
            resource: resource,
            versionId: model.getVersionId(),
            textEdit: {
                range: new Range(1, 6, 1, 6),
                text: '2'
            }
        };
        const insertResult = await bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [insertEdit] }));
        assert.strictEqual(insertResult, true);
        assert.strictEqual(model.getValue(), 'hello2\nworld');
        assert.notStrictEqual(model.getAlternativeVersionId(), initialAlternativeVersionId);
        const eolEdit = {
            resource: resource,
            versionId: model.getVersionId(),
            textEdit: {
                range: new Range(1, 1, 1, 1),
                text: '',
                eol: 0 /* EndOfLineSequence.LF */
            }
        };
        const eolResult = await bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [eolEdit] }));
        assert.strictEqual(eolResult, true);
        assert.strictEqual(model.getValue(), 'hello2\nworld');
        const undoResult = model.undo();
        if (undoResult) {
            await undoResult;
        }
        assert.strictEqual(model.getValue(), initialText);
        assert.strictEqual(model.getAlternativeVersionId(), initialAlternativeVersionId);
    });
    test(`applyWorkspaceEdit with only resource edit`, () => {
        return bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({
            edits: [
                { oldResource: resource, newResource: resource, options: undefined },
                { oldResource: undefined, newResource: resource, options: undefined },
                { oldResource: resource, newResource: undefined, options: undefined }
            ]
        })).then((result) => {
            assert.strictEqual(result, true);
            assert.strictEqual(movedResources.get(resource), resource);
            assert.strictEqual(createdResources.has(resource), true);
            assert.strictEqual(deletedResources.has(resource), true);
        });
    });
    test('applyWorkspaceEdit can control undo/redo stack 1', async () => {
        const model = modelService.getModel(existingResource);
        const edit1 = {
            range: new Range(1, 1, 1, 2),
            text: 'h',
            forceMoveMarkers: false
        };
        const applied1 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit1], { undoStopBefore: false, undoStopAfter: false });
        assert.strictEqual(applied1, true);
        assert.strictEqual(model.getValue(), 'hello world!');
        const edit2 = {
            range: new Range(1, 2, 1, 6),
            text: 'ELLO',
            forceMoveMarkers: false
        };
        const applied2 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit2], { undoStopBefore: false, undoStopAfter: false });
        assert.strictEqual(applied2, true);
        assert.strictEqual(model.getValue(), 'hELLO world!');
        await model.undo();
        assert.strictEqual(model.getValue(), 'Hello world!');
    });
    test('applyWorkspaceEdit can control undo/redo stack 2', async () => {
        const model = modelService.getModel(existingResource);
        const edit1 = {
            range: new Range(1, 1, 1, 2),
            text: 'h',
            forceMoveMarkers: false
        };
        const applied1 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit1], { undoStopBefore: false, undoStopAfter: false });
        assert.strictEqual(applied1, true);
        assert.strictEqual(model.getValue(), 'hello world!');
        const edit2 = {
            range: new Range(1, 2, 1, 6),
            text: 'ELLO',
            forceMoveMarkers: false
        };
        const applied2 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit2], { undoStopBefore: true, undoStopAfter: false });
        assert.strictEqual(applied2, true);
        assert.strictEqual(model.getValue(), 'hELLO world!');
        await model.undo();
        assert.strictEqual(model.getValue(), 'hello world!');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZEVkaXRvcnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL21haW5UaHJlYWRFZGl0b3JzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsZUFBZSxFQUFjLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RixPQUFPLEVBQUUsYUFBYSxFQUF3QixNQUFNLGlEQUFpRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDaEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbkYsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFFckgsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDMUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2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