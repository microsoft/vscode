/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { MainThreadDocumentsAndEditors } from '../../browser/mainThreadDocumentsAndEditors.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { ModelService } from '../../../../editor/common/services/modelService.js';
import { TestCodeEditorService } from '../../../../editor/test/browser/editorTestServices.js';
import { createTestCodeEditor } from '../../../../editor/test/browser/testCodeEditor.js';
import { mock } from '../../../../base/test/common/mock.js';
import { TestEditorService, TestEditorGroupsService, TestEnvironmentService, TestPathService } from '../../../test/browser/workbenchTestServices.js';
import { Event } from '../../../../base/common/event.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
import { UndoRedoService } from '../../../../platform/undoRedo/common/undoRedoService.js';
import { TestDialogService } from '../../../../platform/dialogs/test/common/testDialogService.js';
import { TestNotificationService } from '../../../../platform/notification/test/common/testNotificationService.js';
import { TestTextResourcePropertiesService, TestWorkingCopyFileService } from '../../../test/common/workbenchTestServices.js';
import { UriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentityService.js';
import { TextModel } from '../../../../editor/common/model/textModel.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { LanguageService } from '../../../../editor/common/services/languageService.js';
import { ILanguageConfigurationService } from '../../../../editor/common/languages/languageConfigurationRegistry.js';
import { TestLanguageConfigurationService } from '../../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { ITreeSitterLibraryService } from '../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { TestTreeSitterLibraryService } from '../../../../editor/test/common/services/testTreeSitterLibraryService.js';
suite('MainThreadDocumentsAndEditors', () => {
    let disposables;
    let modelService;
    let codeEditorService;
    let textFileService;
    const deltas = [];
    function myCreateTestCodeEditor(model) {
        return createTestCodeEditor(model, {
            hasTextFocus: false,
            serviceCollection: new ServiceCollection([ICodeEditorService, codeEditorService])
        });
    }
    setup(() => {
        disposables = new DisposableStore();
        deltas.length = 0;
        const configService = new TestConfigurationService();
        configService.setUserConfiguration('editor', { 'detectIndentation': false });
        const dialogService = new TestDialogService();
        const notificationService = new TestNotificationService();
        const undoRedoService = new UndoRedoService(dialogService, notificationService);
        const themeService = new TestThemeService();
        const instantiationService = new TestInstantiationService();
        instantiationService.set(ILanguageService, disposables.add(new LanguageService()));
        instantiationService.set(ILanguageConfigurationService, new TestLanguageConfigurationService());
        instantiationService.set(ITreeSitterLibraryService, new TestTreeSitterLibraryService());
        instantiationService.set(IUndoRedoService, undoRedoService);
        modelService = new ModelService(configService, new TestTextResourcePropertiesService(configService), undoRedoService, instantiationService);
        codeEditorService = new TestCodeEditorService(themeService);
        textFileService = new class extends mock() {
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
            getEncoding() { return 'utf8'; }
        };
        const workbenchEditorService = disposables.add(new TestEditorService());
        const editorGroupService = new TestEditorGroupsService();
        const fileService = new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidRunOperation = Event.None;
                this.onDidChangeFileSystemProviderCapabilities = Event.None;
                this.onDidChangeFileSystemProviderRegistrations = Event.None;
            }
        };
        new MainThreadDocumentsAndEditors(SingleProxyRPCProtocol({
            $acceptDocumentsAndEditorsDelta: (delta) => { deltas.push(delta); },
            $acceptEditorDiffInformation: (id, diffInformation) => { }
        }), modelService, textFileService, workbenchEditorService, codeEditorService, fileService, null, editorGroupService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidPaneCompositeOpen = Event.None;
                this.onDidPaneCompositeClose = Event.None;
            }
            getActivePaneComposite() {
                return undefined;
            }
        }, TestEnvironmentService, new TestWorkingCopyFileService(), new UriIdentityService(fileService), new class extends mock() {
            readText() {
                return Promise.resolve('clipboard_contents');
            }
        }, new TestPathService(), new TestConfigurationService(), new class extends mock() {
            createQuickDiffModelReference() {
                return undefined;
            }
        });
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Model#add', () => {
        deltas.length = 0;
        disposables.add(modelService.createModel('farboo', null));
        assert.strictEqual(deltas.length, 1);
        const [delta] = deltas;
        assert.strictEqual(delta.addedDocuments.length, 1);
        assert.strictEqual(delta.removedDocuments, undefined);
        assert.strictEqual(delta.addedEditors, undefined);
        assert.strictEqual(delta.removedEditors, undefined);
        assert.strictEqual(delta.newActiveEditor, undefined);
    });
    test('ignore huge model', function () {
        const oldLimit = TextModel._MODEL_SYNC_LIMIT;
        try {
            const largeModelString = 'abc'.repeat(1024);
            TextModel._MODEL_SYNC_LIMIT = largeModelString.length / 2;
            const model = modelService.createModel(largeModelString, null);
            disposables.add(model);
            assert.ok(model.isTooLargeForSyncing());
            assert.strictEqual(deltas.length, 1);
            const [delta] = deltas;
            assert.strictEqual(delta.newActiveEditor, null);
            assert.strictEqual(delta.addedDocuments, undefined);
            assert.strictEqual(delta.removedDocuments, undefined);
            assert.strictEqual(delta.addedEditors, undefined);
            assert.strictEqual(delta.removedEditors, undefined);
        }
        finally {
            TextModel._MODEL_SYNC_LIMIT = oldLimit;
        }
    });
    test('ignore huge model from editor', function () {
        const oldLimit = TextModel._MODEL_SYNC_LIMIT;
        try {
            const largeModelString = 'abc'.repeat(1024);
            TextModel._MODEL_SYNC_LIMIT = largeModelString.length / 2;
            const model = modelService.createModel(largeModelString, null);
            const editor = myCreateTestCodeEditor(model);
            assert.strictEqual(deltas.length, 1);
            deltas.length = 0;
            assert.strictEqual(deltas.length, 0);
            editor.dispose();
            model.dispose();
        }
        finally {
            TextModel._MODEL_SYNC_LIMIT = oldLimit;
        }
    });
    test('ignore simple widget model', function () {
        this.timeout(1000 * 60); // increase timeout for this one test
        const model = modelService.createModel('test', null, undefined, true);
        disposables.add(model);
        assert.ok(model.isForSimpleWidget);
        assert.strictEqual(deltas.length, 1);
        const [delta] = deltas;
        assert.strictEqual(delta.newActiveEditor, null);
        assert.strictEqual(delta.addedDocuments, undefined);
        assert.strictEqual(delta.removedDocuments, undefined);
        assert.strictEqual(delta.addedEditors, undefined);
        assert.strictEqual(delta.removedEditors, undefined);
    });
    test('ignore editor w/o model', () => {
        const editor = myCreateTestCodeEditor(undefined);
        assert.strictEqual(deltas.length, 1);
        const [delta] = deltas;
        assert.strictEqual(delta.newActiveEditor, null);
        assert.strictEqual(delta.addedDocuments, undefined);
        assert.strictEqual(delta.removedDocuments, undefined);
        assert.strictEqual(delta.addedEditors, undefined);
        assert.strictEqual(delta.removedEditors, undefined);
        editor.dispose();
    });
    test('editor with model', () => {
        deltas.length = 0;
        const model = modelService.createModel('farboo', null);
        const editor = myCreateTestCodeEditor(model);
        assert.strictEqual(deltas.length, 2);
        const [first, second] = deltas;
        assert.strictEqual(first.addedDocuments.length, 1);
        assert.strictEqual(first.newActiveEditor, undefined);
        assert.strictEqual(first.removedDocuments, undefined);
        assert.strictEqual(first.addedEditors, undefined);
        assert.strictEqual(first.removedEditors, undefined);
        assert.strictEqual(second.addedEditors.length, 1);
        assert.strictEqual(second.addedDocuments, undefined);
        assert.strictEqual(second.removedDocuments, undefined);
        assert.strictEqual(second.removedEditors, undefined);
        assert.strictEqual(second.newActiveEditor, undefined);
        editor.dispose();
        model.dispose();
    });
    test('editor with dispos-ed/-ing model', () => {
        const model = modelService.createModel('farboo', null);
        const editor = myCreateTestCodeEditor(model);
        // ignore things until now
        deltas.length = 0;
        modelService.destroyModel(model.uri);
        assert.strictEqual(deltas.length, 1);
        const [first] = deltas;
        assert.strictEqual(first.newActiveEditor, undefined);
        assert.strictEqual(first.removedEditors.length, 1);
        assert.strictEqual(first.removedDocuments.length, 1);
        assert.strictEqual(first.addedDocuments, undefined);
        assert.strictEqual(first.addedEditors, undefined);
        editor.dispose();
        model.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZERvY3VtZW50c0FuZEVkaXRvcnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL21haW5UaHJlYWREb2N1bWVudHNBbmRFZGl0b3JzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3RFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBQ3RILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNsRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUc5RixPQUFPLEVBQUUsb0JBQW9CLEVBQW1CLE1BQU0sbURBQW1ELENBQUM7QUFDMUcsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxzQkFBc0IsRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNySixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFekQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFOUYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDOUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxpQkFBaUIs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