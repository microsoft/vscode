/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import assert from 'assert';
import { EditorPane, EditorMemento } from '../../../../browser/parts/editor/editorPane.js';
import { WorkspaceTrustRequiredPlaceholderEditor } from '../../../../browser/parts/editor/editorPlaceholder.js';
import { EditorExtensions } from '../../../../common/editor.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { workbenchInstantiationService, TestEditorGroupView, TestEditorGroupsService, registerTestResourceEditor, TestEditorInput, createEditorPart, TestTextResourceConfigurationService } from '../../workbenchTestServices.js';
import { TextResourceEditorInput } from '../../../../common/editor/textResourceEditorInput.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditorPaneDescriptor } from '../../../../browser/editor.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { TestStorageService, TestWorkspaceTrustManagementService } from '../../../common/workbenchTestServices.js';
import { extUri } from '../../../../../base/common/resources.js';
import { EditorService } from '../../../../services/editor/browser/editorService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
const NullThemeService = new TestThemeService();
const editorRegistry = Registry.as(EditorExtensions.EditorPane);
const editorInputRegistry = Registry.as(EditorExtensions.EditorFactory);
class TestEditor extends EditorPane {
    constructor(group) {
        const disposables = new DisposableStore();
        super('TestEditor', group, NullTelemetryService, NullThemeService, disposables.add(new TestStorageService()));
        this._register(disposables);
    }
    getId() { return 'testEditor'; }
    layout() { }
    createEditor() { }
}
class OtherTestEditor extends EditorPane {
    constructor(group) {
        const disposables = new DisposableStore();
        super('testOtherEditor', group, NullTelemetryService, NullThemeService, disposables.add(new TestStorageService()));
        this._register(disposables);
    }
    getId() { return 'testOtherEditor'; }
    layout() { }
    createEditor() { }
}
class TestInputSerializer {
    canSerialize(editorInput) {
        return true;
    }
    serialize(input) {
        return input.toString();
    }
    deserialize(instantiationService, raw) {
        return {};
    }
}
class TestInput extends EditorInput {
    constructor() {
        super(...arguments);
        this.resource = undefined;
    }
    prefersEditorPane(editors) {
        return editors[1];
    }
    get typeId() {
        return 'testInput';
    }
    resolve() {
        return null;
    }
}
class OtherTestInput extends EditorInput {
    constructor() {
        super(...arguments);
        this.resource = undefined;
    }
    get typeId() {
        return 'otherTestInput';
    }
    resolve() {
        return null;
    }
}
class TestResourceEditorInput extends TextResourceEditorInput {
}
suite('EditorPane', () => {
    const disposables = new DisposableStore();
    teardown(() => {
        disposables.clear();
    });
    test('EditorPane API', async () => {
        const group = new TestEditorGroupView(1);
        const editor = new TestEditor(group);
        assert.ok(editor.group);
        const input = disposables.add(new OtherTestInput());
        const options = {};
        assert(!editor.isVisible());
        assert(!editor.input);
        await editor.setInput(input, options, Object.create(null), CancellationToken.None);
        // eslint-disable-next-line local/code-no-any-casts
        assert.strictEqual(input, editor.input);
        editor.setVisible(true);
        assert(editor.isVisible());
        editor.dispose();
        editor.clearInput();
        editor.setVisible(false);
        assert(!editor.isVisible());
        assert(!editor.input);
        assert(!editor.getControl());
    });
    test('EditorPaneDescriptor', () => {
        const editorDescriptor = EditorPaneDescriptor.create(TestEditor, 'id', 'name');
        assert.strictEqual(editorDescriptor.typeId, 'id');
        assert.strictEqual(editorDescriptor.name, 'name');
    });
    test('Editor Pane Registration', function () {
        const editorDescriptor1 = EditorPaneDescriptor.create(TestEditor, 'id1', 'name');
        const editorDescriptor2 = EditorPaneDescriptor.create(OtherTestEditor, 'id2', 'name');
        const oldEditorsCnt = editorRegistry.getEditorPanes().length;
        const oldInputCnt = editorRegistry.getEditors().length;
        disposables.add(editorRegistry.registerEditorPane(editorDescriptor1, [new SyncDescriptor(TestInput)]));
        disposables.add(editorRegistry.registerEditorPane(editorDescriptor2, [new SyncDescriptor(TestInput), new SyncDescriptor(OtherTestInput)]));
        assert.strictEqual(editorRegistry.getEditorPanes().length, oldEditorsCnt + 2);
        assert.strictEqual(editorRegistry.getEditors().length, oldInputCnt + 3);
        assert.strictEqual(editorRegistry.getEditorPane(disposables.add(new TestInput())), editorDescriptor2);
        assert.strictEqual(editorRegistry.getEditorPane(disposables.add(new OtherTestInput())), editorDescriptor2);
        assert.strictEqual(editorRegistry.getEditorPaneByType('id1'), editorDescriptor1);
        assert.strictEqual(editorRegistry.getEditorPaneByType('id2'), editorDescriptor2);
        assert(!editorRegistry.getEditorPaneByType('id3'));
    });
    test('Editor Pane Lookup favors specific class over superclass (match on specific class)', function () {
        const d1 = EditorPaneDescriptor.create(TestEditor, 'id1', 'name');
        disposables.add(registerTestResourceEditor());
        disposables.add(editorRegistry.registerEditorPane(d1, [new SyncDescriptor(TestResourceEditorInput)]));
        const inst = workbenchInstantiationService(undefined, disposables);
        const group = new TestEditorGroupView(1);
        const editor = disposables.add(editorRegistry.getEditorPane(disposables.add(inst.createInstance(TestResourceEditorInput, URI.file('/fake'), 'fake', '', undefined, undefined))).instantiate(inst, group));
        assert.strictEqual(editor.getId(), 'testEditor');
        const otherEditor = disposables.add(editorRegistry.getEditorPane(disposables.add(inst.createInstance(TextResourceEditorInput, URI.file('/fake'), 'fake', '', undefined, undefined))).instantiate(inst, group));
        assert.strictEqual(otherEditor.getId(), 'workbench.editors.textResourceEditor');
    });
    test('Editor Pane Lookup favors specific class over superclass (match on super class)', function () {
        const inst = workbenchInstantiationService(undefined, disposables);
        const group = new TestEditorGroupView(1);
        disposables.add(registerTestResourceEditor());
        const editor = disposables.add(editorRegistry.getEditorPane(disposables.add(inst.createInstance(TestResourceEditorInput, URI.file('/fake'), 'fake', '', undefined, undefined))).instantiate(inst, group));
        assert.strictEqual('workbench.editors.textResourceEditor', editor.getId());
    });
    test('Editor Input Serializer', function () {
        const testInput = disposables.add(new TestEditorInput(URI.file('/fake'), 'testTypeId'));
        workbenchInstantiationService(undefined, disposables).invokeFunction(accessor => editorInputRegistry.start(accessor));
        disposables.add(editorInputRegistry.registerEditorSerializer(testInput.typeId, TestInputSerializer));
        let factory = editorInputRegistry.getEditorSerializer('testTypeId');
        assert(factory);
        factory = editorInputRegistry.getEditorSerializer(testInput);
        assert(factory);
        // throws when registering serializer for same type
        assert.throws(() => editorInputRegistry.registerEditorSerializer(testInput.typeId, TestInputSerializer));
    });
    test('EditorMemento - basics', function () {
        const testGroup0 = new TestEditorGroupView(0);
        const testGroup1 = new TestEditorGroupView(1);
        const testGroup4 = new TestEditorGroupView(4);
        const configurationService = new TestTextResourceConfigurationService();
        const editorGroupService = new TestEditorGroupsService([
            testGroup0,
            testGroup1,
            new TestEditorGroupView(2)
        ]);
        const rawMemento = Object.create(null);
        let memento = disposables.add(new EditorMemento('id', 'key', rawMemento, 3, editorGroupService, configurationService));
        let res = memento.loadEditorState(testGroup0, URI.file('/A'));
        assert.ok(!res);
        memento.saveEditorState(testGroup0, URI.file('/A'), { line: 3 });
        res = memento.loadEditorState(testGroup0, URI.file('/A'));
        assert.ok(res);
        assert.strictEqual(res.line, 3);
        memento.saveEditorState(testGroup1, URI.file('/A'), { line: 5 });
        res = memento.loadEditorState(testGroup1, URI.file('/A'));
        assert.ok(res);
        assert.strictEqual(res.line, 5);
        // Ensure capped at 3 elements
        memento.saveEditorState(testGroup0, URI.file('/B'), { line: 1 });
        memento.saveEditorState(testGroup0, URI.file('/C'), { line: 1 });
        memento.saveEditorState(testGroup0, URI.file('/D'), { line: 1 });
        memento.saveEditorState(testGroup0, URI.file('/E'), { line: 1 });
        assert.ok(!memento.loadEditorState(testGroup0, URI.file('/A')));
        assert.ok(!memento.loadEditorState(testGroup0, URI.file('/B')));
        assert.ok(memento.loadEditorState(testGroup0, URI.file('/C')));
        assert.ok(memento.loadEditorState(testGroup0, URI.file('/D')));
        assert.ok(memento.loadEditorState(testGroup0, URI.file('/E')));
        // Save at an unknown group
        memento.saveEditorState(testGroup4, URI.file('/E'), { line: 1 });
        assert.ok(memento.loadEditorState(testGroup4, URI.file('/E'))); // only gets removed when memento is saved
        memento.saveEditorState(testGroup4, URI.file('/C'), { line: 1 });
        assert.ok(memento.loadEditorState(testGroup4, URI.file('/C'))); // only gets removed when memento is saved
        memento.saveState();
        memento = disposables.add(new EditorMemento('id', 'key', rawMemento, 3, editorGroupService, configurationService));
        assert.ok(memento.loadEditorState(testGroup0, URI.file('/C')));
        assert.ok(memento.loadEditorState(testGroup0, URI.file('/D')));
        assert.ok(memento.loadEditorState(testGroup0, URI.file('/E')));
        // Check on entries no longer there from invalid groups
        assert.ok(!memento.loadEditorState(testGroup4, URI.file('/E')));
        assert.ok(!memento.loadEditorState(testGroup4, URI.file('/C')));
        memento.clearEditorState(URI.file('/C'), testGroup4);
        memento.clearEditorState(URI.file('/E'));
        assert.ok(!memento.loadEditorState(testGroup4, URI.file('/C')));
        assert.ok(memento.loadEditorState(testGroup0, URI.file('/D')));
        assert.ok(!memento.loadEditorState(testGroup0, URI.file('/E')));
    });
    test('EditorMemento - move', function () {
        const testGroup0 = new TestEditorGroupView(0);
        const configurationService = new TestTextResourceConfigurationService();
        const editorGroupService = new TestEditorGroupsService([testGroup0]);
        const rawMemento = Object.create(null);
        const memento = disposables.add(new EditorMemento('id', 'key', rawMemento, 3, editorGroupService, configurationService));
        memento.saveEditorState(testGroup0, URI.file('/some/folder/file-1.txt'), { line: 1 });
        memento.saveEditorState(testGroup0, URI.file('/some/folder/file-2.txt'), { line: 2 });
        memento.saveEditorState(testGroup0, URI.file('/some/other/file.txt'), { line: 3 });
        memento.moveEditorState(URI.file('/some/folder/file-1.txt'), URI.file('/some/folder/file-moved.txt'), extUri);
        let res = memento.loadEditorState(testGroup0, URI.file('/some/folder/file-1.txt'));
        assert.ok(!res);
        res = memento.loadEditorState(testGroup0, URI.file('/some/folder/file-moved.txt'));
        assert.strictEqual(res?.line, 1);
        memento.moveEditorState(URI.file('/some/folder'), URI.file('/some/folder-moved'), extUri);
        res = memento.loadEditorState(testGroup0, URI.file('/some/folder-moved/file-moved.txt'));
        assert.strictEqual(res?.line, 1);
        res = memento.loadEditorState(testGroup0, URI.file('/some/folder-moved/file-2.txt'));
        assert.strictEqual(res?.line, 2);
    });
    test('EditoMemento - use with editor input', function () {
        const testGroup0 = new TestEditorGroupView(0);
        class TestEditorInput extends EditorInput {
            constructor(resource, id = 'testEditorInputForMementoTest') {
                super();
                this.resource = resource;
                this.id = id;
            }
            get typeId() { return 'testEditorInputForMementoTest'; }
            async resolve() { return null; }
            matches(other) {
                return other && this.id === other.id && other instanceof TestEditorInput;
            }
        }
        const rawMemento = Object.create(null);
        const memento = disposables.add(new EditorMemento('id', 'key', rawMemento, 3, new TestEditorGroupsService(), new TestTextResourceConfigurationService()));
        const testInputA = disposables.add(new TestEditorInput(URI.file('/A')));
        let res = memento.loadEditorState(testGroup0, testInputA);
        assert.ok(!res);
        memento.saveEditorState(testGroup0, testInputA, { line: 3 });
        res = memento.loadEditorState(testGroup0, testInputA);
        assert.ok(res);
        assert.strictEqual(res.line, 3);
        // State removed when input gets disposed
        testInputA.dispose();
        res = memento.loadEditorState(testGroup0, testInputA);
        assert.ok(!res);
    });
    test('EditoMemento - clear on editor dispose', function () {
        const testGroup0 = new TestEditorGroupView(0);
        class TestEditorInput extends EditorInput {
            constructor(resource, id = 'testEditorInputForMementoTest') {
                super();
                this.resource = resource;
                this.id = id;
            }
            get typeId() { return 'testEditorInputForMementoTest'; }
            async resolve() { return null; }
            matches(other) {
                return other && this.id === other.id && other instanceof TestEditorInput;
            }
        }
        const rawMemento = Object.create(null);
        const memento = disposables.add(new EditorMemento('id', 'key', rawMemento, 3, new TestEditorGroupsService(), new TestTextResourceConfigurationService()));
        const testInputA = disposables.add(new TestEditorInput(URI.file('/A')));
        let res = memento.loadEditorState(testGroup0, testInputA);
        assert.ok(!res);
        memento.saveEditorState(testGroup0, testInputA.resource, { line: 3 });
        res = memento.loadEditorState(testGroup0, testInputA);
        assert.ok(res);
        assert.strictEqual(res.line, 3);
        // State not yet removed when input gets disposed
        // because we used resource
        testInputA.dispose();
        res = memento.loadEditorState(testGroup0, testInputA);
        assert.ok(res);
        const testInputB = disposables.add(new TestEditorInput(URI.file('/B')));
        res = memento.loadEditorState(testGroup0, testInputB);
        assert.ok(!res);
        memento.saveEditorState(testGroup0, testInputB.resource, { line: 3 });
        res = memento.loadEditorState(testGroup0, testInputB);
        assert.ok(res);
        assert.strictEqual(res.line, 3);
        memento.clearEditorStateOnDispose(testInputB.resource, testInputB);
        // State removed when input gets disposed
        testInputB.dispose();
        res = memento.loadEditorState(testGroup0, testInputB);
        assert.ok(!res);
    });
    test('EditorMemento - workbench.editor.sharedViewState', function () {
        const testGroup0 = new TestEditorGroupView(0);
        const testGroup1 = new TestEditorGroupView(1);
        const configurationService = new TestTextResourceConfigurationService(new TestConfigurationService({
            workbench: {
                editor: {
                    sharedViewState: true
                }
            }
        }));
        const editorGroupService = new TestEditorGroupsService([testGroup0]);
        const rawMemento = Object.create(null);
        const memento = disposables.add(new EditorMemento('id', 'key', rawMemento, 3, editorGroupService, configurationService));
        const resource = URI.file('/some/folder/file-1.txt');
        memento.saveEditorState(testGroup0, resource, { line: 1 });
        let res = memento.loadEditorState(testGroup0, resource);
        assert.strictEqual(res.line, 1);
        res = memento.loadEditorState(testGroup1, resource);
        assert.strictEqual(res.line, 1);
        memento.saveEditorState(testGroup0, resource, { line: 3 });
        res = memento.loadEditorState(testGroup1, resource);
        assert.strictEqual(res.line, 3);
        memento.saveEditorState(testGroup1, resource, { line: 1 });
        res = memento.loadEditorState(testGroup1, resource);
        assert.strictEqual(res.line, 1);
        memento.clearEditorState(resource, testGroup0);
        memento.clearEditorState(resource, testGroup1);
        res = memento.loadEditorState(testGroup1, resource);
        assert.strictEqual(res.line, 1);
        memento.clearEditorState(resource);
        res = memento.loadEditorState(testGroup1, resource);
        assert.ok(!res);
    });
    test('WorkspaceTrustRequiredEditor', async function () {
        let TrustRequiredTestEditor = class TrustRequiredTestEditor extends EditorPane {
            constructor(group, telemetryService) {
                super('TestEditor', group, NullTelemetryService, NullThemeService, disposables.add(new TestStorageService()));
            }
            getId() { return 'trustRequiredTestEditor'; }
            layout() { }
            createEditor() { }
        };
        TrustRequiredTestEditor = __decorate([
            __param(1, ITelemetryService)
        ], TrustRequiredTestEditor);
        class TrustRequiredTestInput extends EditorInput {
            constructor() {
                super(...arguments);
                this.resource = undefined;
            }
            get typeId() {
                return 'trustRequiredTestInput';
            }
            get capabilities() {
                return 16 /* EditorInputCapabilities.RequiresTrust */;
            }
            resolve() {
                return null;
            }
        }
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        const workspaceTrustService = disposables.add(instantiationService.createInstance(TestWorkspaceTrustManagementService));
        instantiationService.stub(IWorkspaceTrustManagementService, workspaceTrustService);
        workspaceTrustService.setWorkspaceTrust(false);
        const editorPart = await createEditorPart(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, editorPart);
        const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
        instantiationService.stub(IEditorService, editorService);
        const group = editorPart.activeGroup;
        const editorDescriptor = EditorPaneDescriptor.create(TrustRequiredTestEditor, 'id1', 'name');
        disposables.add(editorRegistry.registerEditorPane(editorDescriptor, [new SyncDescriptor(TrustRequiredTestInput)]));
        const testInput = disposables.add(new TrustRequiredTestInput());
        await group.openEditor(testInput);
        assert.strictEqual(group.activeEditorPane?.getId(), WorkspaceTrustRequiredPlaceholderEditor.ID);
        const getEditorPaneIdAsync = () => new Promise(resolve => {
            disposables.add(editorService.onDidActiveEditorChange(() => {
                resolve(group.activeEditorPane?.getId());
            }));
        });
        workspaceTrustService.setWorkspaceTrust(true);
        assert.strictEqual(await getEditorPaneIdAsync(), 'trustRequiredTestEditor');
        workspaceTrustService.setWorkspaceTrust(false);
        assert.strictEqual(await getEditorPaneIdAsync(), WorkspaceTrustRequiredPlaceholderEditor.ID);
        await group.closeAllEditors();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yUGFuZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFuZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ2hILE9BQU8sRUFBNkMsZ0JBQWdCLEVBQTJELE1BQU0sOEJBQThCLENBQUM7QUFFcEssT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUM3RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsbUJBQW1CLEVBQUUsdUJBQXVCLEVBQUUsMEJBQTBCLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLG9DQUFvQyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDbE8sT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDL0YsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDakcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxvQkFBb0IsRUFBc0IsTUFBTSwrQkFBK0IsQ0FBQztBQUN6RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMs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