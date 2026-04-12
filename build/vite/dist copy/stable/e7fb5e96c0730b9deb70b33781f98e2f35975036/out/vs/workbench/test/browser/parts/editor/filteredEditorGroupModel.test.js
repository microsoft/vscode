/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { EditorGroupModel } from '../../../../common/editor/editorGroupModel.js';
import { EditorExtensions } from '../../../../common/editor.js';
import { TestLifecycleService } from '../../workbenchTestServices.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { TestContextService, TestStorageService } from '../../../common/workbenchTestServices.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StickyEditorGroupModel, UnstickyEditorGroupModel } from '../../../../common/editor/filteredEditorGroupModel.js';
suite('FilteredEditorGroupModel', () => {
    let testInstService;
    suiteTeardown(() => {
        testInstService?.dispose();
        testInstService = undefined;
    });
    function inst() {
        if (!testInstService) {
            testInstService = new TestInstantiationService();
        }
        const inst = testInstService;
        inst.stub(IStorageService, disposables.add(new TestStorageService()));
        inst.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
        inst.stub(IWorkspaceContextService, new TestContextService());
        inst.stub(ITelemetryService, NullTelemetryService);
        const config = new TestConfigurationService();
        config.setUserConfiguration('workbench', { editor: { openPositioning: 'right', focusRecentEditorAfterClose: true } });
        inst.stub(IConfigurationService, config);
        return inst;
    }
    function createEditorGroupModel(serialized) {
        const group = disposables.add(inst().createInstance(EditorGroupModel, serialized));
        disposables.add(toDisposable(() => {
            for (const editor of group.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)) {
                group.closeEditor(editor);
            }
        }));
        return group;
    }
    let index = 0;
    class TestEditorInput extends EditorInput {
        constructor(id) {
            super();
            this.id = id;
            this.resource = undefined;
        }
        get typeId() { return 'testEditorInputForGroups'; }
        async resolve() { return null; }
        matches(other) {
            return other && this.id === other.id && other instanceof TestEditorInput;
        }
        setDirty() {
            this._onDidChangeDirty.fire();
        }
        setLabel() {
            this._onDidChangeLabel.fire();
        }
    }
    class NonSerializableTestEditorInput extends EditorInput {
        constructor(id) {
            super();
            this.id = id;
            this.resource = undefined;
        }
        get typeId() { return 'testEditorInputForGroups-nonSerializable'; }
        async resolve() { return null; }
        matches(other) {
            return other && this.id === other.id && other instanceof NonSerializableTestEditorInput;
        }
    }
    class TestFileEditorInput extends EditorInput {
        constructor(id, resource) {
            super();
            this.id = id;
            this.resource = resource;
            this.preferredResource = this.resource;
        }
        get typeId() { return 'testFileEditorInputForGroups'; }
        get editorId() { return this.id; }
        async resolve() { return null; }
        setPreferredName(name) { }
        setPreferredDescription(description) { }
        setPreferredResource(resource) { }
        async setEncoding(encoding) { }
        getEncoding() { return undefined; }
        setPreferredEncoding(encoding) { }
        setForceOpenAsBinary() { }
        setPreferredContents(contents) { }
        setLanguageId(languageId) { }
        setPreferredLanguageId(languageId) { }
        isResolved() { return false; }
        matches(other) {
            if (super.matches(other)) {
                return true;
            }
            if (other instanceof TestFileEditorInput) {
                return isEqual(other.resource, this.resource);
            }
            return false;
        }
    }
    function input(id = String(index++), nonSerializable, resource) {
        if (resource) {
            return disposables.add(new TestFileEditorInput(id, resource));
        }
        return nonSerializable ? disposables.add(new NonSerializableTestEditorInput(id)) : disposables.add(new TestEditorInput(id));
    }
    function closeAllEditors(group) {
        for (const editor of group.getEditors(1 /* EditorsOrder.SEQUENTIAL */)) {
            group.closeEditor(editor, undefined, false);
        }
    }
    class TestEditorInputSerializer {
        static { this.disableSerialize = false; }
        static { this.disableDeserialize = false; }
        canSerialize(editorInput) {
            return true;
        }
        serialize(editorInput) {
            if (TestEditorInputSerializer.disableSerialize) {
                return undefined;
            }
            const testEditorInput = editorInput;
            const testInput = {
                id: testEditorInput.id
            };
            return JSON.stringify(testInput);
        }
        deserialize(instantiationService, serializedEditorInput) {
            if (TestEditorInputSerializer.disableDeserialize) {
                return undefined;
            }
            const testInput = JSON.parse(serializedEditorInput);
            return disposables.add(new TestEditorInput(testInput.id));
        }
    }
    const disposables = new DisposableStore();
    setup(() => {
        TestEditorInputSerializer.disableSerialize = false;
        TestEditorInputSerializer.disableDeserialize = false;
        disposables.add(Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer('testEditorInputForGroups', TestEditorInputSerializer));
    });
    teardown(() => {
        disposables.clear();
        index = 1;
    });
    test('Sticky/Unsticky count', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        model.openEditor(input1, { pinned: true, sticky: true });
        model.openEditor(input2, { pinned: true, sticky: true });
        assert.strictEqual(stickyFilteredEditorGroup.count, 2);
        assert.strictEqual(unstickyFilteredEditorGroup.count, 0);
        model.unstick(input1);
        assert.strictEqual(stickyFilteredEditorGroup.count, 1);
        assert.strictEqual(unstickyFilteredEditorGroup.count, 1);
        model.unstick(input2);
        assert.strictEqual(stickyFilteredEditorGroup.count, 0);
        assert.strictEqual(unstickyFilteredEditorGroup.count, 2);
    });
    test('Sticky/Unsticky stickyCount', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        model.openEditor(input1, { pinned: true, sticky: true });
        model.openEditor(input2, { pinned: true, sticky: true });
        assert.strictEqual(stickyFilteredEditorGroup.stickyCount, 2);
        assert.strictEqual(unstickyFilteredEditorGroup.stickyCount, 0);
        model.unstick(input1);
        assert.strictEqual(stickyFilteredEditorGroup.stickyCount, 1);
        assert.strictEqual(unstickyFilteredEditorGroup.stickyCount, 0);
        model.unstick(input2);
        assert.strictEqual(stickyFilteredEditorGroup.stickyCount, 0);
        assert.strictEqual(unstickyFilteredEditorGroup.stickyCount, 0);
    });
    test('Sticky/Unsticky isEmpty', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        model.openEditor(input1, { pinned: true, sticky: false });
        model.openEditor(input2, { pinned: true, sticky: false });
        assert.strictEqual(stickyFilteredEditorGroup.count === 0, true);
        assert.strictEqual(unstickyFilteredEditorGroup.count === 0, false);
        model.stick(input1);
        assert.strictEqual(stickyFilteredEditorGroup.count === 0, false);
        assert.strictEqual(unstickyFilteredEditorGroup.count === 0, false);
        model.stick(input2);
        assert.strictEqual(stickyFilteredEditorGroup.count === 0, false);
        assert.strictEqual(unstickyFilteredEditorGroup.count === 0, true);
    });
    test('Sticky/Unsticky editors', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        model.openEditor(input1, { pinned: true, sticky: true });
        model.openEditor(input2, { pinned: true, sticky: true });
        assert.strictEqual(stickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */).length, 2);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */).length, 0);
        model.unstick(input1);
        assert.strictEqual(stickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */).length, 1);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */).length, 1);
        assert.strictEqual(stickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */)[0], input2);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */)[0], input1);
        model.unstick(input2);
        assert.strictEqual(stickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */).length, 0);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */).length, 2);
    });
    test('Sticky/Unsticky activeEditor', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        model.openEditor(input1, { pinned: true, sticky: true, active: true });
        assert.strictEqual(stickyFilteredEditorGroup.activeEditor, input1);
        assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, null);
        model.openEditor(input2, { pinned: true, sticky: false, active: true });
        assert.strictEqual(stickyFilteredEditorGroup.activeEditor, null);
        assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, input2);
        model.closeEditor(input1);
        assert.strictEqual(stickyFilteredEditorGroup.activeEditor, null);
        assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, input2);
        model.closeEditor(input2);
        assert.strictEqual(stickyFilteredEditorGroup.activeEditor, null);
        assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, null);
    });
    test('Sticky/Unsticky previewEditor', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        model.openEditor(input1);
        assert.strictEqual(stickyFilteredEditorGroup.previewEditor, null);
        assert.strictEqual(unstickyFilteredEditorGroup.previewEditor, input1);
        model.openEditor(input2, { sticky: true });
        assert.strictEqual(stickyFilteredEditorGroup.previewEditor, null);
        assert.strictEqual(unstickyFilteredEditorGroup.previewEditor, input1);
    });
    test('Sticky/Unsticky isSticky()', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        model.openEditor(input1, { pinned: true, sticky: true });
        model.openEditor(input2, { pinned: true, sticky: true });
        assert.strictEqual(stickyFilteredEditorGroup.isSticky(input1), true);
        assert.strictEqual(stickyFilteredEditorGroup.isSticky(input2), true);
        model.unstick(input1);
        model.closeEditor(input1);
        model.openEditor(input2, { pinned: true, sticky: true });
        assert.strictEqual(unstickyFilteredEditorGroup.isSticky(input1), false);
        assert.strictEqual(unstickyFilteredEditorGroup.isSticky(input2), false);
    });
    test('Sticky/Unsticky isPinned()', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        const input3 = input();
        const input4 = input();
        model.openEditor(input1, { pinned: true, sticky: true });
        model.openEditor(input2, { pinned: true, sticky: false });
        model.openEditor(input3, { pinned: false, sticky: true });
        model.openEditor(input4, { pinned: false, sticky: false });
        assert.strictEqual(stickyFilteredEditorGroup.isPinned(input1), true);
        assert.strictEqual(unstickyFilteredEditorGroup.isPinned(input2), true);
        assert.strictEqual(stickyFilteredEditorGroup.isPinned(input3), true);
        assert.strictEqual(unstickyFilteredEditorGroup.isPinned(input4), false);
    });
    test('Sticky/Unsticky isActive()', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        model.openEditor(input1, { pinned: true, sticky: true, active: true });
        assert.strictEqual(stickyFilteredEditorGroup.isActive(input1), true);
        model.openEditor(input2, { pinned: true, sticky: false, active: true });
        assert.strictEqual(stickyFilteredEditorGroup.isActive(input1), false);
        assert.strictEqual(unstickyFilteredEditorGroup.isActive(input2), true);
        model.unstick(input1);
        assert.strictEqual(unstickyFilteredEditorGroup.isActive(input1), false);
        assert.strictEqual(unstickyFilteredEditorGroup.isActive(input2), true);
    });
    test('Sticky/Unsticky getEditors()', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        model.openEditor(input1, { pinned: true, sticky: true, active: true });
        model.openEditor(input2, { pinned: true, sticky: true, active: true });
        // all sticky editors
        assert.strictEqual(stickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */).length, 2);
        assert.strictEqual(stickyFilteredEditorGroup.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */).length, 2);
        // no unsticky editors
        assert.strictEqual(unstickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */).length, 0);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */).length, 0);
        // options: excludeSticky
        assert.strictEqual(stickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */, { excludeSticky: true }).length, 0);
        assert.strictEqual(stickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */, { excludeSticky: false }).length, 2);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */, { excludeSticky: true }).length, 0);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */, { excludeSticky: false }).length, 0);
        assert.strictEqual(stickyFilteredEditorGroup.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)[0], input2);
        assert.strictEqual(stickyFilteredEditorGroup.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)[1], input1);
        model.unstick(input1);
        assert.strictEqual(stickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */).length, 1);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */).length, 1);
        assert.strictEqual(stickyFilteredEditorGroup.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)[0], input2);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */)[0], input1);
        model.unstick(input2);
        // all unsticky editors
        assert.strictEqual(stickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */).length, 0);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */).length, 2);
        // order: MOST_RECENTLY_ACTIVE
        assert.strictEqual(unstickyFilteredEditorGroup.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)[0], input2);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)[1], input1);
        // order: SEQUENTIAL
        assert.strictEqual(unstickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */)[0], input2);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */)[1], input1);
    });
    test('Sticky/Unsticky getEditorByIndex()', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        const input3 = input();
        model.openEditor(input1, { pinned: true, sticky: true });
        model.openEditor(input2, { pinned: true, sticky: true });
        assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(0), input1);
        assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(1), input2);
        assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(2), undefined);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(0), undefined);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(1), undefined);
        model.openEditor(input3, { pinned: true, sticky: false });
        assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(0), input1);
        assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(1), input2);
        assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(2), undefined);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(0), input3);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(1), undefined);
        model.unstick(input1);
        assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(0), input2);
        assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(1), undefined);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(0), input1);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(1), input3);
        assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(2), undefined);
    });
    test('Sticky/Unsticky indexOf()', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        const input3 = input();
        model.openEditor(input1, { pinned: true, sticky: true });
        model.openEditor(input2, { pinned: true, sticky: true });
        assert.strictEqual(stickyFilteredEditorGroup.indexOf(input1), 0);
        assert.strictEqual(stickyFilteredEditorGroup.indexOf(input2), 1);
        assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input1), -1);
        assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input2), -1);
        model.openEditor(input3, { pinned: true, sticky: false });
        assert.strictEqual(stickyFilteredEditorGroup.indexOf(input1), 0);
        assert.strictEqual(stickyFilteredEditorGroup.indexOf(input2), 1);
        assert.strictEqual(stickyFilteredEditorGroup.indexOf(input3), -1);
        assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input1), -1);
        assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input2), -1);
        assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input3), 0);
        model.unstick(input1);
        assert.strictEqual(stickyFilteredEditorGroup.indexOf(input1), -1);
        assert.strictEqual(stickyFilteredEditorGroup.indexOf(input2), 0);
        assert.strictEqual(stickyFilteredEditorGroup.indexOf(input3), -1);
        assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input1), 0);
        assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input2), -1);
        assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input3), 1);
    });
    test('Sticky/Unsticky isFirst()', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        model.openEditor(input1, { pinned: true, sticky: true });
        assert.strictEqual(stickyFilteredEditorGroup.isFirst(input1), true);
        model.openEditor(input2, { pinned: true, sticky: true });
        assert.strictEqual(stickyFilteredEditorGroup.isFirst(input1), true);
        assert.strictEqual(stickyFilteredEditorGroup.isFirst(input2), false);
        model.unstick(input1);
        assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input1), true);
        assert.strictEqual(stickyFilteredEditorGroup.isFirst(input2), true);
        model.unstick(input2);
        assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input1), false);
        assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input2), true);
        model.moveEditor(input2, 1);
        assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input1), true);
        assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input2), false);
    });
    test('Sticky/Unsticky isLast()', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        model.openEditor(input1, { pinned: true, sticky: true });
        assert.strictEqual(stickyFilteredEditorGroup.isLast(input1), true);
        model.openEditor(input2, { pinned: true, sticky: true });
        assert.strictEqual(stickyFilteredEditorGroup.isLast(input1), false);
        assert.strictEqual(stickyFilteredEditorGroup.isLast(input2), true);
        model.unstick(input1);
        assert.strictEqual(unstickyFilteredEditorGroup.isLast(input1), true);
        assert.strictEqual(stickyFilteredEditorGroup.isLast(input2), true);
        model.unstick(input2);
        assert.strictEqual(unstickyFilteredEditorGroup.isLast(input1), true);
        assert.strictEqual(unstickyFilteredEditorGroup.isLast(input2), false);
        model.moveEditor(input2, 1);
        assert.strictEqual(unstickyFilteredEditorGroup.isLast(input1), false);
        assert.strictEqual(unstickyFilteredEditorGroup.isLast(input2), true);
    });
    test('Sticky/Unsticky contains()', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        model.openEditor(input1, { pinned: true, sticky: true });
        model.openEditor(input2, { pinned: true, sticky: true });
        assert.strictEqual(stickyFilteredEditorGroup.contains(input1), true);
        assert.strictEqual(stickyFilteredEditorGroup.contains(input2), true);
        assert.strictEqual(unstickyFilteredEditorGroup.contains(input1), false);
        assert.strictEqual(unstickyFilteredEditorGroup.contains(input2), false);
        model.unstick(input1);
        assert.strictEqual(stickyFilteredEditorGroup.contains(input1), false);
        assert.strictEqual(stickyFilteredEditorGroup.contains(input2), true);
        assert.strictEqual(unstickyFilteredEditorGroup.contains(input1), true);
        assert.strictEqual(unstickyFilteredEditorGroup.contains(input2), false);
        model.unstick(input2);
        assert.strictEqual(stickyFilteredEditorGroup.contains(input1), false);
        assert.strictEqual(stickyFilteredEditorGroup.contains(input2), false);
        assert.strictEqual(unstickyFilteredEditorGroup.contains(input1), true);
        assert.strictEqual(unstickyFilteredEditorGroup.contains(input2), true);
    });
    test('Sticky/Unsticky group information', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        // same id
        assert.strictEqual(stickyFilteredEditorGroup.id, model.id);
        assert.strictEqual(unstickyFilteredEditorGroup.id, model.id);
        // group locking same behaviour
        assert.strictEqual(stickyFilteredEditorGroup.isLocked, model.isLocked);
        assert.strictEqual(unstickyFilteredEditorGroup.isLocked, model.isLocked);
        model.lock(true);
        assert.strictEqual(stickyFilteredEditorGroup.isLocked, model.isLocked);
        assert.strictEqual(unstickyFilteredEditorGroup.isLocked, model.isLocked);
        model.lock(false);
        assert.strictEqual(stickyFilteredEditorGroup.isLocked, model.isLocked);
        assert.strictEqual(unstickyFilteredEditorGroup.isLocked, model.isLocked);
    });
    test('Multiple Editors - Editor Emits Dirty and Label Changed', function () {
        const model1 = createEditorGroupModel();
        const model2 = createEditorGroupModel();
        const stickyFilteredEditorGroup1 = disposables.add(new StickyEditorGroupModel(model1));
        const unstickyFilteredEditorGroup1 = disposables.add(new UnstickyEditorGroupModel(model1));
        const stickyFilteredEditorGroup2 = disposables.add(new StickyEditorGroupModel(model2));
        const unstickyFilteredEditorGroup2 = disposables.add(new UnstickyEditorGroupModel(model2));
        const input1 = input();
        const input2 = input();
        model1.openEditor(input1, { pinned: true, active: true });
        model2.openEditor(input2, { pinned: true, active: true, sticky: true });
        // DIRTY
        let dirty1CounterSticky = 0;
        disposables.add(stickyFilteredEditorGroup1.onDidModelChange((e) => {
            if (e.kind === 14 /* GroupModelChangeKind.EDITOR_DIRTY */) {
                dirty1CounterSticky++;
            }
        }));
        let dirty1CounterUnsticky = 0;
        disposables.add(unstickyFilteredEditorGroup1.onDidModelChange((e) => {
            if (e.kind === 14 /* GroupModelChangeKind.EDITOR_DIRTY */) {
                dirty1CounterUnsticky++;
            }
        }));
        let dirty2CounterSticky = 0;
        disposables.add(stickyFilteredEditorGroup2.onDidModelChange((e) => {
            if (e.kind === 14 /* GroupModelChangeKind.EDITOR_DIRTY */) {
                dirty2CounterSticky++;
            }
        }));
        let dirty2CounterUnsticky = 0;
        disposables.add(unstickyFilteredEditorGroup2.onDidModelChange((e) => {
            if (e.kind === 14 /* GroupModelChangeKind.EDITOR_DIRTY */) {
                dirty2CounterUnsticky++;
            }
        }));
        // LABEL
        let label1ChangeCounterSticky = 0;
        disposables.add(stickyFilteredEditorGroup1.onDidModelChange((e) => {
            if (e.kind === 9 /* GroupModelChangeKind.EDITOR_LABEL */) {
                label1ChangeCounterSticky++;
            }
        }));
        let label1ChangeCounterUnsticky = 0;
        disposables.add(unstickyFilteredEditorGroup1.onDidModelChange((e) => {
            if (e.kind === 9 /* GroupModelChangeKind.EDITOR_LABEL */) {
                label1ChangeCounterUnsticky++;
            }
        }));
        let label2ChangeCounterSticky = 0;
        disposables.add(stickyFilteredEditorGroup2.onDidModelChange((e) => {
            if (e.kind === 9 /* GroupModelChangeKind.EDITOR_LABEL */) {
                label2ChangeCounterSticky++;
            }
        }));
        let label2ChangeCounterUnsticky = 0;
        disposables.add(unstickyFilteredEditorGroup2.onDidModelChange((e) => {
            if (e.kind === 9 /* GroupModelChangeKind.EDITOR_LABEL */) {
                label2ChangeCounterUnsticky++;
            }
        }));
        input1.setDirty();
        input1.setLabel();
        assert.strictEqual(dirty1CounterSticky, 0);
        assert.strictEqual(dirty1CounterUnsticky, 1);
        assert.strictEqual(label1ChangeCounterSticky, 0);
        assert.strictEqual(label1ChangeCounterUnsticky, 1);
        input2.setDirty();
        input2.setLabel();
        assert.strictEqual(dirty2CounterSticky, 1);
        assert.strictEqual(dirty2CounterUnsticky, 0);
        assert.strictEqual(label2ChangeCounterSticky, 1);
        assert.strictEqual(label2ChangeCounterUnsticky, 0);
        closeAllEditors(model2);
        input2.setDirty();
        input2.setLabel();
        assert.strictEqual(dirty2CounterSticky, 1);
        assert.strictEqual(dirty2CounterUnsticky, 0);
        assert.strictEqual(label2ChangeCounterSticky, 1);
        assert.strictEqual(label2ChangeCounterUnsticky, 0);
        assert.strictEqual(dirty1CounterSticky, 0);
        assert.strictEqual(dirty1CounterUnsticky, 1);
        assert.strictEqual(label1ChangeCounterSticky, 0);
        assert.strictEqual(label1ChangeCounterUnsticky, 1);
    });
    test('Sticky/Unsticky isTransient()', async () => {
        const model = createEditorGroupModel();
        const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
        const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
        const input1 = input();
        const input2 = input();
        const input3 = input();
        const input4 = input();
        model.openEditor(input1, { pinned: true, transient: false });
        model.openEditor(input2, { pinned: true });
        model.openEditor(input3, { pinned: true, transient: true });
        model.openEditor(input4, { pinned: false, transient: true });
        assert.strictEqual(stickyFilteredEditorGroup.isTransient(input1), false);
        assert.strictEqual(unstickyFilteredEditorGroup.isTransient(input2), false);
        assert.strictEqual(stickyFilteredEditorGroup.isTransient(input3), true);
        assert.strictEqual(unstickyFilteredEditorGroup.isTransient(input4), true);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsdGVyZWRFZGl0b3JHcm91cE1vZGVsLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvdGVzdC9icm93c2VyL3BhcnRzL2VkaXRvci9maWx0ZXJlZEVkaXRvckdyb3VwTW9kZWwudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGdCQUFnQixFQUErQixNQUFNLCtDQUErQyxDQUFDO0FBQzlHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBbUcsTUFBTSw4QkFBOEIsQ0FBQztBQUVqSyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFL0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGtCQUFrQixFQUFFLE1BQU0s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