/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { URI } from '../../../../../base/common/uri.js';
import { Event } from '../../../../../base/common/event.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorCloseContext, isEditorInputWithOptions, SideBySideEditor, isEditorInput } from '../../../../common/editor.js';
import { workbenchInstantiationService, TestServiceAccessor, registerTestEditor, TestFileEditorInput, registerTestResourceEditor, registerTestSideBySideEditor, createEditorPart, registerTestFileEditor, TestTextFileEditor, TestForceRevealFileEditorInput, workbenchTeardown } from '../../../../test/browser/workbenchTestServices.js';
import { EditorService } from '../../browser/editorService.js';
import { IEditorGroupsService } from '../../common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../common/editorService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { FileEditorInput } from '../../../../contrib/files/browser/editors/fileEditorInput.js';
import { timeout } from '../../../../../base/common/async.js';
import { FileOperationEvent } from '../../../../../platform/files/common/files.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { RegisteredEditorPriority } from '../../common/editorResolverService.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { ErrorPlaceholderEditor } from '../../../../browser/parts/editor/editorPlaceholder.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('EditorService', () => {
    const TEST_EDITOR_ID = 'MyTestEditorForEditorService';
    const TEST_EDITOR_INPUT_ID = 'testEditorInputForEditorService';
    const disposables = new DisposableStore();
    let testLocalInstantiationService = undefined;
    setup(() => {
        disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(TestForceRevealFileEditorInput)], TEST_EDITOR_INPUT_ID));
        disposables.add(registerTestResourceEditor());
        disposables.add(registerTestSideBySideEditor());
    });
    teardown(async () => {
        if (testLocalInstantiationService) {
            await workbenchTeardown(testLocalInstantiationService);
            testLocalInstantiationService = undefined;
        }
        disposables.clear();
    });
    async function createEditorService(instantiationService = workbenchInstantiationService(undefined, disposables)) {
        const part = await createEditorPart(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, part);
        const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
        instantiationService.stub(IEditorService, editorService);
        testLocalInstantiationService = instantiationService;
        return [part, editorService, instantiationService.createInstance(TestServiceAccessor)];
    }
    function createTestFileEditorInput(resource, typeId) {
        return disposables.add(new TestFileEditorInput(resource, typeId));
    }
    test('openEditor() - basics', async () => {
        const [, service, accessor] = await createEditorService();
        await testOpenBasics(service, accessor.editorPaneService);
    });
    test('openEditor() - basics (scoped)', async () => {
        const [part, service, accessor] = await createEditorService();
        const scoped = service.createScoped(part, disposables);
        await part.whenReady;
        await testOpenBasics(scoped, accessor.editorPaneService);
    });
    async function testOpenBasics(editorService, editorPaneService) {
        let input = createTestFileEditorInput(URI.parse('my://resource-basics'), TEST_EDITOR_INPUT_ID);
        let otherInput = createTestFileEditorInput(URI.parse('my://resource2-basics'), TEST_EDITOR_INPUT_ID);
        let activeEditorChangeEventCounter = 0;
        disposables.add(editorService.onDidActiveEditorChange(() => {
            activeEditorChangeEventCounter++;
        }));
        let visibleEditorChangeEventCounter = 0;
        disposables.add(editorService.onDidVisibleEditorsChange(() => {
            visibleEditorChangeEventCounter++;
        }));
        let willOpenEditorListenerCounter = 0;
        disposables.add(editorService.onWillOpenEditor(() => {
            willOpenEditorListenerCounter++;
        }));
        let didCloseEditorListenerCounter = 0;
        disposables.add(editorService.onDidCloseEditor(() => {
            didCloseEditorListenerCounter++;
        }));
        let willInstantiateEditorPaneListenerCounter = 0;
        disposables.add(editorPaneService.onWillInstantiateEditorPane(e => {
            if (e.typeId === TEST_EDITOR_ID) {
                willInstantiateEditorPaneListenerCounter++;
            }
        }));
        // Open input
        let editor = await editorService.openEditor(input, { pinned: true });
        assert.strictEqual(editor?.getId(), TEST_EDITOR_ID);
        assert.strictEqual(editor, editorService.activeEditorPane);
        assert.strictEqual(1, editorService.count);
        assert.strictEqual(input, editorService.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)[0].editor);
        assert.strictEqual(input, editorService.getEditors(1 /* EditorsOrder.SEQUENTIAL */)[0].editor);
        assert.strictEqual(input, editorService.activeEditor);
        assert.strictEqual(editorService.visibleEditorPanes.length, 1);
        assert.strictEqual(editorService.visibleEditorPanes[0], editor);
        assert.ok(!editorService.activeTextEditorControl);
        assert.ok(!editorService.activeTextEditorLanguageId);
        assert.strictEqual(editorService.visibleTextEditorControls.length, 0);
        assert.strictEqual(editorService.getVisibleTextEditorControls(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */).length, 0);
        assert.strictEqual(editorService.isOpened(input), true);
        assert.strictEqual(editorService.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), true);
        assert.strictEqual(editorService.isOpened({ resource: input.resource, typeId: input.typeId, editorId: 'unknownTypeId' }), false);
        assert.strictEqual(editorService.isOpened({ resource: input.resource, typeId: 'unknownTypeId', editorId: input.editorId }), false);
        assert.strictEqual(editorService.isOpened({ resource: input.resource, typeId: 'unknownTypeId', editorId: 'unknownTypeId' }), false);
        assert.strictEqual(editorService.isVisible(input), true);
        assert.strictEqual(editorService.isVisible(otherInput), false);
        assert.strictEqual(willOpenEditorListenerCounter, 1);
        assert.strictEqual(activeEditorChangeEventCounter, 1);
        assert.strictEqual(visibleEditorChangeEventCounter, 1);
        assert.ok(editorPaneService.didInstantiateEditorPane(TEST_EDITOR_ID));
        assert.strictEqual(willInstantiateEditorPaneListenerCounter, 1);
        // Close input
        await editor?.group.closeEditor(input);
        assert.strictEqual(0, editorService.count);
        assert.strictEqual(0, editorService.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */).length);
        assert.strictEqual(0, editorService.getEditors(1 /* EditorsOrder.SEQUENTIAL */).length);
        assert.strictEqual(didCloseEditorListenerCounter, 1);
        assert.strictEqual(activeEditorChangeEventCounter, 2);
        assert.strictEqual(visibleEditorChangeEventCounter, 2);
        assert.ok(input.gotDisposed);
        // Open again 2 inputs (disposed editors are ignored!)
        await editorService.openEditor(input, { pinned: true });
        assert.strictEqual(0, editorService.count);
        // Open again 2 inputs (recreate because disposed)
        input = createTestFileEditorInput(URI.parse('my://resource-basics'), TEST_EDITOR_INPUT_ID);
        otherInput = createTestFileEditorInput(URI.parse('my://resource2-basics'), TEST_EDITOR_INPUT_ID);
        await editorService.openEditor(input, { pinned: true });
        editor = await editorService.openEditor(otherInput, { pinned: true });
        assert.strictEqual(2, editorService.count);
        assert.strictEqual(otherInput, editorService.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)[0].editor);
        assert.strictEqual(input, editorService.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)[1].editor);
        assert.strictEqual(input, editorService.getEditors(1 /* EditorsOrder.SEQUENTIAL */)[0].editor);
        assert.strictEqual(otherInput, editorService.getEditors(1 /* EditorsOrder.SEQUENTIAL */)[1].editor);
        assert.strictEqual(editorService.visibleEditorPanes.length, 1);
        assert.strictEqual(editorService.isOpened(input), true);
        assert.strictEqual(editorService.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), true);
        assert.strictEqual(editorService.isOpened(otherInput), true);
        assert.strictEqual(editorService.isOpened({ resource: otherInput.resource, typeId: otherInput.typeId, editorId: otherInput.editorId }), true);
        assert.strictEqual(activeEditorChangeEventCounter, 4);
        assert.strictEqual(willOpenEditorListenerCounter, 3);
        assert.strictEqual(visibleEditorChangeEventCounter, 4);
        const stickyInput = createTestFileEditorInput(URI.parse('my://resource3-basics'), TEST_EDITOR_INPUT_ID);
        await editorService.openEditor(stickyInput, { sticky: true });
        assert.strictEqual(3, editorService.count);
        const allSequentialEditors = editorService.getEditors(1 /* EditorsOrder.SEQUENTIAL */);
        assert.strictEqual(allSequentialEditors.length, 3);
        assert.strictEqual(stickyInput, allSequentialEditors[0].editor);
        assert.strictEqual(input, allSequentialEditors[1].editor);
        assert.strictEqual(otherInput, allSequentialEditors[2].editor);
        const sequentialEditorsExcludingSticky = editorService.getEditors(1 /* EditorsOrder.SEQUENTIAL */, { excludeSticky: true });
        assert.strictEqual(sequentialEditorsExcludingSticky.length, 2);
        assert.strictEqual(input, sequentialEditorsExcludingSticky[0].editor);
        assert.strictEqual(otherInput, sequentialEditorsExcludingSticky[1].editor);
        const mruEditorsExcludingSticky = editorService.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */, { excludeSticky: true });
        assert.strictEqual(mruEditorsExcludingSticky.length, 2);
        assert.strictEqual(input, sequentialEditorsExcludingSticky[0].editor);
        assert.strictEqual(otherInput, sequentialEditorsExcludingSticky[1].editor);
    }
    test('openEditor() - multiple calls are cancelled and indicated as such', async () => {
        const [, service] = await createEditorService();
        const input = createTestFileEditorInput(URI.parse('my://resource-basics'), TEST_EDITOR_INPUT_ID);
        const otherInput = createTestFileEditorInput(URI.parse('my://resource2-basics'), TEST_EDITOR_INPUT_ID);
        let activeEditorChangeEventCounter = 0;
        const activeEditorChangeListener = service.onDidActiveEditorChange(() => {
            activeEditorChangeEventCounter++;
        });
        let visibleEditorChangeEventCounter = 0;
        const visibleEditorChangeListener = service.onDidVisibleEditorsChange(() => {
            visibleEditorChangeEventCounter++;
        });
        const editorP1 = service.openEditor(input, { pinned: true });
        const editorP2 = service.openEditor(otherInput, { pinned: true });
        const editor1 = await editorP1;
        assert.strictEqual(editor1, undefined);
        const editor2 = await editorP2;
        assert.strictEqual(editor2?.input, otherInput);
        assert.strictEqual(activeEditorChangeEventCounter, 1);
        assert.strictEqual(visibleEditorChangeEventCounter, 1);
        activeEditorChangeListener.dispose();
        visibleEditorChangeListener.dispose();
    });
    test('openEditor() - same input does not cancel previous one - https://github.com/microsoft/vscode/issues/136684', async () => {
        const [, service] = await createEditorService();
        let input = createTestFileEditorInput(URI.parse('my://resource-basics'), TEST_EDITOR_INPUT_ID);
        let editorP1 = service.openEditor(input, { pinned: true });
        let editorP2 = service.openEditor(input, { pinned: true });
        let editor1 = await editorP1;
        assert.strictEqual(editor1?.input, input);
        let editor2 = await editorP2;
        assert.strictEqual(editor2?.input, input);
        assert.ok(editor2.group);
        await editor2.group.closeAllEditors();
        input = createTestFileEditorInput(URI.parse('my://resource-basics'), TEST_EDITOR_INPUT_ID);
        const inputSame = createTestFileEditorInput(URI.parse('my://resource-basics'), TEST_EDITOR_INPUT_ID);
        editorP1 = service.openEditor(input, { pinned: true });
        editorP2 = service.openEditor(inputSame, { pinned: true });
        editor1 = await editorP1;
        assert.strictEqual(editor1?.input, input);
        editor2 = await editorP2;
        assert.strictEqual(editor2?.input, input);
    });
    test('openEditor() - force-reveal typed editors reveal instead of split', async () => {
        const [part, service] = await createEditorService();
        const input1 = disposables.add(new TestForceRevealFileEditorInput(URI.parse('my://resource-basics1'), TEST_EDITOR_INPUT_ID));
        const input2 = disposables.add(new TestForceRevealFileEditorInput(URI.parse('my://resource-basics2'), TEST_EDITOR_INPUT_ID));
        const input1Group = (await service.openEditor(input1, { pinned: true }))?.group;
        const input2Group = (await service.openEditor(input2, { pinned: true }, SIDE_GROUP))?.group;
        assert.strictEqual(part.activeGroup, input2Group);
        await service.openEditor(input1, { pinned: true });
        assert.strictEqual(part.activeGroup, input1Group);
    });
    test('openEditor() - locked groups', async () => {
        disposables.add(registerTestFileEditor());
        const [part, service, accessor] = await createEditorService();
        disposables.add(accessor.editorResolverService.registerEditor('*.editor-service-locked-group-tests', { id: TEST_EDITOR_INPUT_ID, label: 'Label', priority: RegisteredEditorPriority.exclusive }, {}, {
            createEditorInput: editor => ({ editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
        }));
        const input1 = { resource: URI.parse('file://resource-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const input2 = { resource: URI.parse('file://resource2-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const input3 = { resource: URI.parse('file://resource3-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const input4 = { resource: URI.parse('file://resource4-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const input5 = { resource: URI.parse('file://resource5-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const input6 = { resource: URI.parse('file://resource6-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const input7 = { resource: URI.parse('file://resource7-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const editor1 = await service.openEditor(input1, { pinned: true });
        const editor2 = await service.openEditor(input2, { pinned: true }, SIDE_GROUP);
        const group1 = editor1?.group;
        assert.strictEqual(group1?.count, 1);
        const group2 = editor2?.group;
        assert.strictEqual(group2?.count, 1);
        group2.lock(true);
        part.activateGroup(group2.id);
        // Will open in group 1 because group 2 is locked
        await service.openEditor(input3, { pinned: true });
        assert.strictEqual(group1.count, 2);
        assert.strictEqual(group1.activeEditor?.resource?.toString(), input3.resource.toString());
        assert.strictEqual(group2.count, 1);
        // Will open in group 2 because group was provided
        await service.openEditor(input3, { pinned: true }, group2.id);
        assert.strictEqual(group1.count, 2);
        assert.strictEqual(group2.count, 2);
        assert.strictEqual(group2.activeEditor?.resource?.toString(), input3.resource.toString());
        // Will reveal editor in group 2 because it is contained
        await service.openEditor(input2, { pinned: true }, group2);
        await service.openEditor(input2, { pinned: true }, ACTIVE_GROUP);
        assert.strictEqual(group1.count, 2);
        assert.strictEqual(group2.count, 2);
        assert.strictEqual(group2.activeEditor?.resource?.toString(), input2.resource.toString());
        // Will open a new group because side group is locked
        part.activateGroup(group1.id);
        const editor3 = await service.openEditor(input4, { pinned: true }, SIDE_GROUP);
        assert.strictEqual(part.count, 3);
        const group3 = editor3?.group;
        assert.strictEqual(group3?.count, 1);
        // Will reveal editor in group 2 because it is contained
        await service.openEditor(input3, { pinned: true }, group2);
        part.activateGroup(group1.id);
        await service.openEditor(input3, { pinned: true }, SIDE_GROUP);
        assert.strictEqual(part.count, 3);
        // Will open a new group if all groups are locked
        group1.lock(true);
        group2.lock(true);
        group3.lock(true);
        part.activateGroup(group1.id);
        const editor5 = await service.openEditor(input5, { pinned: true });
        const group4 = editor5?.group;
        assert.strictEqual(group4?.count, 1);
        assert.strictEqual(group4.activeEditor?.resource?.toString(), input5.resource.toString());
        assert.strictEqual(part.count, 4);
        // Will open editor in most recently non-locked group
        group1.lock(false);
        group2.lock(false);
        group3.lock(false);
        group4.lock(false);
        part.activateGroup(group3.id);
        part.activateGroup(group2.id);
        part.activateGroup(group4.id);
        group4.lock(true);
        group2.lock(true);
        await service.openEditor(input6, { pinned: true });
        assert.strictEqual(part.count, 4);
        assert.strictEqual(part.activeGroup, group3);
        assert.strictEqual(group3.activeEditor?.resource?.toString(), input6.resource.toString());
        // Will find the right group where editor is already opened in when all groups are locked
        group1.lock(true);
        group2.lock(true);
        group3.lock(true);
        group4.lock(true);
        part.activateGroup(group1.id);
        await service.openEditor(input6, { pinned: true });
        assert.strictEqual(part.count, 4);
        assert.strictEqual(part.activeGroup, group3);
        assert.strictEqual(group3.activeEditor?.resource?.toString(), input6.resource.toString());
        assert.strictEqual(part.activeGroup, group3);
        assert.strictEqual(group3.activeEditor?.resource?.toString(), input6.resource.toString());
        part.activateGroup(group1.id);
        await service.openEditor(input6, { pinned: true });
        assert.strictEqual(part.count, 4);
        assert.strictEqual(part.activeGroup, group3);
        assert.strictEqual(group3.activeEditor?.resource?.toString(), input6.resource.toString());
        // Will reveal an opened editor in the active locked group
        await service.openEditor(input7, { pinned: true }, group3);
        await service.openEditor(input6, { pinned: true });
        assert.strictEqual(part.count, 4);
        assert.strictEqual(part.activeGroup, group3);
        assert.strictEqual(group3.activeEditor?.resource?.toString(), input6.resource.toString());
    });
    test('locked groups - workbench.editor.revealIfOpen', async () => {
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        const configurationService = new TestConfigurationService();
        await configurationService.setUserConfiguration('workbench', { 'editor': { 'revealIfOpen': true } });
        instantiationService.stub(IConfigurationService, configurationService);
        disposables.add(registerTestFileEditor());
        const [part, service, accessor] = await createEditorService(instantiationService);
        disposables.add(accessor.editorResolverService.registerEditor('*.editor-service-locked-group-tests', { id: TEST_EDITOR_INPUT_ID, label: 'Label', priority: RegisteredEditorPriority.exclusive }, {}, {
            createEditorInput: editor => ({ editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
        }));
        const rootGroup = part.activeGroup;
        const rightGroup = part.addGroup(rootGroup, 3 /* GroupDirection.RIGHT */);
        part.activateGroup(rootGroup);
        const input1 = { resource: URI.parse('file://resource-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const input2 = { resource: URI.parse('file://resource2-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const input3 = { resource: URI.parse('file://resource3-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const input4 = { resource: URI.parse('file://resource4-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        await service.openEditor(input1, rootGroup.id);
        await service.openEditor(input2, rootGroup.id);
        assert.strictEqual(part.activeGroup.id, rootGroup.id);
        await service.openEditor(input3, rightGroup.id);
        await service.openEditor(input4, rightGroup.id);
        assert.strictEqual(part.activeGroup.id, rightGroup.id);
        rootGroup.lock(true);
        rightGroup.lock(true);
        await service.openEditor(input1);
        assert.strictEqual(part.activeGroup.id, rootGroup.id);
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), input1.resource.toString());
        await service.openEditor(input3);
        assert.strictEqual(part.activeGroup.id, rightGroup.id);
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), input3.resource.toString());
        assert.strictEqual(part.groups.length, 2);
    });
    test('locked groups - revealIfVisible', async () => {
        disposables.add(registerTestFileEditor());
        const [part, service, accessor] = await createEditorService();
        disposables.add(accessor.editorResolverService.registerEditor('*.editor-service-locked-group-tests', { id: TEST_EDITOR_INPUT_ID, label: 'Label', priority: RegisteredEditorPriority.exclusive }, {}, {
            createEditorInput: editor => ({ editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
        }));
        const rootGroup = part.activeGroup;
        const rightGroup = part.addGroup(rootGroup, 3 /* GroupDirection.RIGHT */);
        part.activateGroup(rootGroup);
        const input1 = { resource: URI.parse('file://resource-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const input2 = { resource: URI.parse('file://resource2-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const input3 = { resource: URI.parse('file://resource3-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const input4 = { resource: URI.parse('file://resource4-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        await service.openEditor(input1, rootGroup.id);
        await service.openEditor(input2, rootGroup.id);
        assert.strictEqual(part.activeGroup.id, rootGroup.id);
        await service.openEditor(input3, rightGroup.id);
        await service.openEditor(input4, rightGroup.id);
        assert.strictEqual(part.activeGroup.id, rightGroup.id);
        rootGroup.lock(true);
        rightGroup.lock(true);
        await service.openEditor({ ...input2, options: { ...input2.options, revealIfVisible: true } });
        assert.strictEqual(part.activeGroup.id, rootGroup.id);
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), input2.resource.toString());
        await service.openEditor({ ...input4, options: { ...input4.options, revealIfVisible: true } });
        assert.strictEqual(part.activeGroup.id, rightGroup.id);
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), input4.resource.toString());
        assert.strictEqual(part.groups.length, 2);
    });
    test('locked groups - revealIfOpened', async () => {
        disposables.add(registerTestFileEditor());
        const [part, service, accessor] = await createEditorService();
        disposables.add(accessor.editorResolverService.registerEditor('*.editor-service-locked-group-tests', { id: TEST_EDITOR_INPUT_ID, label: 'Label', priority: RegisteredEditorPriority.exclusive }, {}, {
            createEditorInput: editor => ({ editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
        }));
        const rootGroup = part.activeGroup;
        const rightGroup = part.addGroup(rootGroup, 3 /* GroupDirection.RIGHT */);
        part.activateGroup(rootGroup);
        const input1 = { resource: URI.parse('file://resource-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const input2 = { resource: URI.parse('file://resource2-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const input3 = { resource: URI.parse('file://resource3-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        const input4 = { resource: URI.parse('file://resource4-basics.editor-service-locked-group-tests'), options: { pinned: true } };
        await service.openEditor(input1, rootGroup.id);
        await service.openEditor(input2, rootGroup.id);
        assert.strictEqual(part.activeGroup.id, rootGroup.id);
        await service.openEditor(input3, rightGroup.id);
        await service.openEditor(input4, rightGroup.id);
        assert.strictEqual(part.activeGroup.id, rightGroup.id);
        rootGroup.lock(true);
        rightGroup.lock(true);
        await service.openEditor({ ...input1, options: { ...input1.options, revealIfOpened: true } });
        assert.strictEqual(part.activeGroup.id, rootGroup.id);
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), input1.resource.toString());
        await service.openEditor({ ...input3, options: { ...input3.options, revealIfOpened: true } });
        assert.strictEqual(part.activeGroup.id, rightGroup.id);
        assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), input3.resource.toString());
        assert.strictEqual(part.groups.length, 2);
    });
    test('openEditor() - untyped, typed', () => {
        return testOpenEditors(false);
    });
    test('openEditors() - untyped, typed', () => {
        return testOpenEditors(true);
    });
    async function testOpenEditors(useOpenEditors) {
        disposables.add(registerTestFileEditor());
        const [part, service, accessor] = await createEditorService();
        let rootGroup = part.activeGroup;
        let editorFactoryCalled = 0;
        let untitledEditorFactoryCalled = 0;
        let diffEditorFactoryCalled = 0;
        let lastEditorFactoryEditor = undefined;
        let lastUntitledEditorFactoryEditor = undefined;
        let lastDiffEditorFactoryEditor = undefined;
        disposables.add(accessor.editorResolverService.registerEditor('*.editor-service-override-tests', { id: TEST_EDITOR_INPUT_ID, label: 'Label', priority: RegisteredEditorPriority.exclusive }, {}, {
            createEditorInput: editor => {
                editorFactoryCalled++;
                lastEditorFactoryEditor = editor;
                return { editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) };
            },
            createUntitledEditorInput: untitledEditor => {
                untitledEditorFactoryCalled++;
                lastUntitledEditorFactoryEditor = untitledEditor;
                return { editor: createTestFileEditorInput(untitledEditor.resource ?? URI.parse(`untitled://my-untitled-editor-${untitledEditorFactoryCalled}`), TEST_EDITOR_INPUT_ID) };
            },
            createDiffEditorInput: diffEditor => {
                diffEditorFactoryCalled++;
                lastDiffEditorFactoryEditor = diffEditor;
                return { editor: createTestFileEditorInput(URI.file(`diff-editor-${diffEditorFactoryCalled}`), TEST_EDITOR_INPUT_ID) };
            }
        }));
        async function resetTestState() {
            editorFactoryCalled = 0;
            untitledEditorFactoryCalled = 0;
            diffEditorFactoryCalled = 0;
            lastEditorFactoryEditor = undefined;
            lastUntitledEditorFactoryEditor = undefined;
            lastDiffEditorFactoryEditor = undefined;
            await workbenchTeardown(accessor.instantiationService);
            rootGroup = part.activeGroup;
        }
        async function openEditor(editor, group) {
            if (useOpenEditors) {
                // The type safety isn't super good here, so we assist with runtime checks
                // Open editors expects untyped or editor input with options, you cannot pass a typed editor input
                // without options
                if (!isEditorInputWithOptions(editor) && isEditorInput(editor)) {
                    editor = { editor: editor, options: {} };
                }
                const panes = await service.openEditors([editor], group);
                return panes[0];
            }
            if (isEditorInputWithOptions(editor)) {
                return service.openEditor(editor.editor, editor.options, group);
            }
            return service.openEditor(editor, group);
        }
        // untyped
        {
            // untyped resource editor, no options, no group
            {
                const untypedEditor = { resource: URI.file('file.editor-service-override-tests') };
                const pane = await openEditor(untypedEditor);
                let typedEditor = pane?.input;
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(typedEditor instanceof TestFileEditorInput);
                assert.strictEqual(typedEditor.resource.toString(), untypedEditor.resource.toString());
                assert.strictEqual(editorFactoryCalled, 1);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.strictEqual(lastEditorFactoryEditor, untypedEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                // opening the same editor should not create
                // a new editor input
                await openEditor(untypedEditor);
                assert.strictEqual(pane?.group.activeEditor, typedEditor);
                // replaceEditors should work too
                const untypedEditorReplacement = { resource: URI.file('file-replaced.editor-service-override-tests') };
                await service.replaceEditors([{
                        editor: typedEditor,
                        replacement: untypedEditorReplacement
                    }], rootGroup);
                typedEditor = rootGroup.activeEditor;
                assert.ok(typedEditor instanceof TestFileEditorInput);
                assert.strictEqual(typedEditor?.resource?.toString(), untypedEditorReplacement.resource.toString());
                assert.strictEqual(editorFactoryCalled, 3);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.strictEqual(lastEditorFactoryEditor, untypedEditorReplacement);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
            // untyped resource editor, options (override text), no group
            {
                const untypedEditor = { resource: URI.file('file.editor-service-override-tests'), options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
                const pane = await openEditor(untypedEditor);
                const typedEditor = pane?.input;
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(typedEditor instanceof FileEditorInput);
                assert.strictEqual(typedEditor.resource.toString(), untypedEditor.resource.toString());
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                // opening the same editor should not create
                // a new editor input
                await openEditor(untypedEditor);
                assert.strictEqual(pane?.group.activeEditor, typedEditor);
                await resetTestState();
            }
            // untyped resource editor, options (override text, sticky: true, preserveFocus: true), no group
            {
                const untypedEditor = { resource: URI.file('file.editor-service-override-tests'), options: { sticky: true, preserveFocus: true, override: DEFAULT_EDITOR_ASSOCIATION.id } };
                const pane = await openEditor(untypedEditor);
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(pane.input instanceof FileEditorInput);
                assert.strictEqual(pane.input.resource.toString(), untypedEditor.resource.toString());
                assert.strictEqual(pane.group.isSticky(pane.input), true);
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
                await part.activeGroup.closeEditor(pane.input);
            }
            // untyped resource editor, options (override default), no group
            {
                const untypedEditor = { resource: URI.file('file.editor-service-override-tests'), options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
                const pane = await openEditor(untypedEditor);
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(pane.input instanceof FileEditorInput);
                assert.strictEqual(pane.input.resource.toString(), untypedEditor.resource.toString());
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
            // untyped resource editor, options (override: TEST_EDITOR_INPUT_ID), no group
            {
                const untypedEditor = { resource: URI.file('file.editor-service-override-tests'), options: { override: TEST_EDITOR_INPUT_ID } };
                const pane = await openEditor(untypedEditor);
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(pane.input instanceof TestFileEditorInput);
                assert.strictEqual(pane.input.resource.toString(), untypedEditor.resource.toString());
                assert.strictEqual(editorFactoryCalled, 1);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.strictEqual(lastEditorFactoryEditor, untypedEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
            // untyped resource editor, options (sticky: true, preserveFocus: true), no group
            {
                const untypedEditor = { resource: URI.file('file.editor-service-override-tests'), options: { sticky: true, preserveFocus: true } };
                const pane = await openEditor(untypedEditor);
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(pane.input instanceof TestFileEditorInput);
                assert.strictEqual(pane.input.resource.toString(), untypedEditor.resource.toString());
                assert.strictEqual(pane.group.isSticky(pane.input), true);
                assert.strictEqual(editorFactoryCalled, 1);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.strictEqual(lastEditorFactoryEditor.resource.toString(), untypedEditor.resource.toString());
                assert.strictEqual(lastEditorFactoryEditor.options?.preserveFocus, true);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
                await part.activeGroup.closeEditor(pane.input);
            }
            // untyped resource editor, options (override: TEST_EDITOR_INPUT_ID, sticky: true, preserveFocus: true), no group
            {
                const untypedEditor = { resource: URI.file('file.editor-service-override-tests'), options: { sticky: true, preserveFocus: true, override: TEST_EDITOR_INPUT_ID } };
                const pane = await openEditor(untypedEditor);
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(pane.input instanceof TestFileEditorInput);
                assert.strictEqual(pane.input.resource.toString(), untypedEditor.resource.toString());
                assert.strictEqual(pane.group.isSticky(pane.input), true);
                assert.strictEqual(editorFactoryCalled, 1);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.strictEqual(lastEditorFactoryEditor.resource.toString(), untypedEditor.resource.toString());
                assert.strictEqual(lastEditorFactoryEditor.options?.preserveFocus, true);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
                await part.activeGroup.closeEditor(pane.input);
            }
            // untyped resource editor, no options, SIDE_GROUP
            {
                const untypedEditor = { resource: URI.file('file.editor-service-override-tests') };
                const pane = await openEditor(untypedEditor, SIDE_GROUP);
                assert.strictEqual(accessor.editorGroupService.groups.length, 2);
                assert.notStrictEqual(pane?.group, rootGroup);
                assert.ok(pane?.input instanceof TestFileEditorInput);
                assert.strictEqual(pane?.input.resource.toString(), untypedEditor.resource.toString());
                assert.strictEqual(editorFactoryCalled, 1);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.strictEqual(lastEditorFactoryEditor, untypedEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
            // untyped resource editor, options (override text), SIDE_GROUP
            {
                const untypedEditor = { resource: URI.file('file.editor-service-override-tests'), options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
                const pane = await openEditor(untypedEditor, SIDE_GROUP);
                assert.strictEqual(accessor.editorGroupService.groups.length, 2);
                assert.notStrictEqual(pane?.group, rootGroup);
                assert.ok(pane?.input instanceof FileEditorInput);
                assert.strictEqual(pane.input.resource.toString(), untypedEditor.resource.toString());
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
        }
        // Typed
        {
            // typed editor, no options, no group
            {
                const typedEditor = createTestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
                const pane = await openEditor({ editor: typedEditor });
                let typedInput = pane?.input;
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(typedInput instanceof TestFileEditorInput);
                assert.strictEqual(typedInput.resource.toString(), typedEditor.resource.toString());
                // It's a typed editor input so the resolver should not have been called
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                // opening the same editor should not create
                // a new editor input
                await openEditor(typedEditor);
                assert.strictEqual(pane?.group.activeEditor, typedInput);
                // replaceEditors should work too
                const typedEditorReplacement = createTestFileEditorInput(URI.file('file-replaced.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
                await service.replaceEditors([{
                        editor: typedEditor,
                        replacement: typedEditorReplacement
                    }], rootGroup);
                typedInput = rootGroup.activeEditor;
                assert.ok(typedInput instanceof TestFileEditorInput);
                assert.strictEqual(typedInput.resource.toString(), typedEditorReplacement.resource.toString());
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
            // typed editor, no options, no group
            {
                const typedEditor = createTestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
                const pane = await openEditor({ editor: typedEditor });
                const typedInput = pane?.input;
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(typedInput instanceof TestFileEditorInput);
                assert.strictEqual(typedInput.resource.toString(), typedEditor.resource.toString());
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                // opening the same editor should not create
                // a new editor input
                await openEditor(typedEditor);
                assert.strictEqual(pane?.group.activeEditor, typedEditor);
                await resetTestState();
            }
            // typed editor, options (no override, sticky: true, preserveFocus: true), no group
            {
                const typedEditor = createTestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
                const pane = await openEditor({ editor: typedEditor, options: { sticky: true, preserveFocus: true } });
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(pane.input instanceof TestFileEditorInput);
                assert.strictEqual(pane.input.resource.toString(), typedEditor.resource.toString());
                assert.strictEqual(pane.group.isSticky(pane.input), true);
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
                await part.activeGroup.closeEditor(pane.input);
            }
            // typed editor, options (override default), no group
            {
                const typedEditor = createTestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
                const pane = await openEditor({ editor: typedEditor, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } });
                assert.strictEqual(pane?.group, rootGroup);
                // We shouldn't have resolved because it is a typed editor, even though we have an override specified
                assert.ok(pane.input instanceof TestFileEditorInput);
                assert.strictEqual(pane.input.resource.toString(), typedEditor.resource.toString());
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
            // typed editor, options (override: TEST_EDITOR_INPUT_ID), no group
            {
                const typedEditor = createTestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
                const pane = await openEditor({ editor: typedEditor, options: { override: TEST_EDITOR_INPUT_ID } });
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(pane.input instanceof TestFileEditorInput);
                assert.strictEqual(pane.input.resource.toString(), typedEditor.resource.toString());
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
            // typed editor, options (sticky: true, preserveFocus: true), no group
            {
                const typedEditor = createTestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
                const pane = await openEditor({ editor: typedEditor, options: { sticky: true, preserveFocus: true } });
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(pane.input instanceof TestFileEditorInput);
                assert.strictEqual(pane.input.resource.toString(), typedEditor.resource.toString());
                assert.strictEqual(pane.group.isSticky(pane.input), true);
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
                await part.activeGroup.closeEditor(pane.input);
            }
            // typed editor, options (override: TEST_EDITOR_INPUT_ID, sticky: true, preserveFocus: true), no group
            {
                const typedEditor = createTestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
                const pane = await openEditor({ editor: typedEditor, options: { sticky: true, preserveFocus: true, override: TEST_EDITOR_INPUT_ID } });
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(pane.input instanceof TestFileEditorInput);
                assert.strictEqual(pane.input.resource.toString(), typedEditor.resource.toString());
                assert.strictEqual(pane.group.isSticky(pane.input), true);
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
                await part.activeGroup.closeEditor(pane.input);
            }
            // typed editor, no options, SIDE_GROUP
            {
                const typedEditor = createTestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
                const pane = await openEditor({ editor: typedEditor }, SIDE_GROUP);
                assert.strictEqual(accessor.editorGroupService.groups.length, 2);
                assert.notStrictEqual(pane?.group, rootGroup);
                assert.ok(pane?.input instanceof TestFileEditorInput);
                assert.strictEqual(pane?.input.resource.toString(), typedEditor.resource.toString());
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
            // typed editor, options (no override), SIDE_GROUP
            {
                const typedEditor = createTestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
                const pane = await openEditor({ editor: typedEditor }, SIDE_GROUP);
                assert.strictEqual(accessor.editorGroupService.groups.length, 2);
                assert.notStrictEqual(pane?.group, rootGroup);
                assert.ok(pane?.input instanceof TestFileEditorInput);
                assert.strictEqual(pane.input.resource.toString(), typedEditor.resource.toString());
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
        }
        // Untyped untitled
        {
            // untyped untitled editor, no options, no group
            {
                const untypedEditor = { resource: undefined, options: { override: TEST_EDITOR_INPUT_ID } };
                const pane = await openEditor(untypedEditor);
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(pane.input instanceof TestFileEditorInput);
                assert.strictEqual(pane.input.resource.scheme, 'untitled');
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 1);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.strictEqual(lastUntitledEditorFactoryEditor, untypedEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
            // untyped untitled editor, no options, SIDE_GROUP
            {
                const untypedEditor = { resource: undefined, options: { override: TEST_EDITOR_INPUT_ID } };
                const pane = await openEditor(untypedEditor, SIDE_GROUP);
                assert.strictEqual(accessor.editorGroupService.groups.length, 2);
                assert.notStrictEqual(pane?.group, rootGroup);
                assert.ok(pane?.input instanceof TestFileEditorInput);
                assert.strictEqual(pane?.input.resource.scheme, 'untitled');
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 1);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.strictEqual(lastUntitledEditorFactoryEditor, untypedEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
            // untyped untitled editor with associated resource, no options, no group
            {
                const untypedEditor = { resource: URI.file('file-original.editor-service-override-tests').with({ scheme: 'untitled' }) };
                const pane = await openEditor(untypedEditor);
                const typedEditor = pane?.input;
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(typedEditor instanceof TestFileEditorInput);
                assert.strictEqual(typedEditor.resource.scheme, 'untitled');
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 1);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.strictEqual(lastUntitledEditorFactoryEditor, untypedEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                // opening the same editor should not create
                // a new editor input
                await openEditor(untypedEditor);
                assert.strictEqual(pane?.group.activeEditor, typedEditor);
                await resetTestState();
            }
            // untyped untitled editor, options (sticky: true, preserveFocus: true), no group
            {
                const untypedEditor = { resource: undefined, options: { sticky: true, preserveFocus: true, override: TEST_EDITOR_INPUT_ID } };
                const pane = await openEditor(untypedEditor);
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(pane.input instanceof TestFileEditorInput);
                assert.strictEqual(pane.input.resource.scheme, 'untitled');
                assert.strictEqual(pane.group.isSticky(pane.input), true);
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 1);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.strictEqual(lastUntitledEditorFactoryEditor, untypedEditor);
                assert.strictEqual(lastUntitledEditorFactoryEditor.options?.preserveFocus, true);
                assert.strictEqual(lastUntitledEditorFactoryEditor.options?.sticky, true);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
        }
        // Untyped diff
        {
            // untyped diff editor, no options, no group
            {
                const untypedEditor = {
                    original: { resource: URI.file('file-original.editor-service-override-tests') },
                    modified: { resource: URI.file('file-modified.editor-service-override-tests') },
                    options: { override: TEST_EDITOR_INPUT_ID }
                };
                const pane = await openEditor(untypedEditor);
                const typedEditor = pane?.input;
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(typedEditor instanceof TestFileEditorInput);
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 1);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.strictEqual(lastDiffEditorFactoryEditor, untypedEditor);
                await resetTestState();
            }
            // untyped diff editor, no options, SIDE_GROUP
            {
                const untypedEditor = {
                    original: { resource: URI.file('file-original.editor-service-override-tests') },
                    modified: { resource: URI.file('file-modified.editor-service-override-tests') },
                    options: { override: TEST_EDITOR_INPUT_ID }
                };
                const pane = await openEditor(untypedEditor, SIDE_GROUP);
                assert.strictEqual(accessor.editorGroupService.groups.length, 2);
                assert.notStrictEqual(pane?.group, rootGroup);
                assert.ok(pane?.input instanceof TestFileEditorInput);
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 1);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.strictEqual(lastDiffEditorFactoryEditor, untypedEditor);
                await resetTestState();
            }
            // untyped diff editor, options (sticky: true, preserveFocus: true), no group
            {
                const untypedEditor = {
                    original: { resource: URI.file('file-original.editor-service-override-tests') },
                    modified: { resource: URI.file('file-modified.editor-service-override-tests') },
                    options: {
                        override: TEST_EDITOR_INPUT_ID, sticky: true, preserveFocus: true
                    }
                };
                const pane = await openEditor(untypedEditor);
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(pane.input instanceof TestFileEditorInput);
                assert.strictEqual(pane.group.isSticky(pane.input), true);
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 1);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.strictEqual(lastDiffEditorFactoryEditor, untypedEditor);
                assert.strictEqual(lastDiffEditorFactoryEditor.options?.preserveFocus, true);
                assert.strictEqual(lastDiffEditorFactoryEditor.options?.sticky, true);
                await resetTestState();
            }
        }
        // typed editor, not registered
        {
            // no options, no group
            {
                const typedEditor = createTestFileEditorInput(URI.file('file.something'), TEST_EDITOR_INPUT_ID);
                const pane = await openEditor({ editor: typedEditor });
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(pane.input instanceof TestFileEditorInput);
                assert.strictEqual(pane.input, typedEditor);
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
            // no options, SIDE_GROUP
            {
                const typedEditor = createTestFileEditorInput(URI.file('file.something'), TEST_EDITOR_INPUT_ID);
                const pane = await openEditor({ editor: typedEditor }, SIDE_GROUP);
                assert.strictEqual(accessor.editorGroupService.groups.length, 2);
                assert.notStrictEqual(pane?.group, rootGroup);
                assert.ok(pane?.input instanceof TestFileEditorInput);
                assert.strictEqual(pane?.input, typedEditor);
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
        }
        // typed editor, not supporting `toUntyped`
        {
            // no options, no group
            {
                const typedEditor = createTestFileEditorInput(URI.file('file.something'), TEST_EDITOR_INPUT_ID);
                typedEditor.disableToUntyped = true;
                const pane = await openEditor({ editor: typedEditor });
                assert.strictEqual(pane?.group, rootGroup);
                assert.ok(pane.input instanceof TestFileEditorInput);
                assert.strictEqual(pane.input, typedEditor);
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
            // no options, SIDE_GROUP
            {
                const typedEditor = createTestFileEditorInput(URI.file('file.something'), TEST_EDITOR_INPUT_ID);
                typedEditor.disableToUntyped = true;
                const pane = await openEditor({ editor: typedEditor }, SIDE_GROUP);
                assert.strictEqual(accessor.editorGroupService.groups.length, 2);
                assert.notStrictEqual(pane?.group, rootGroup);
                assert.ok(pane?.input instanceof TestFileEditorInput);
                assert.strictEqual(pane?.input, typedEditor);
                assert.strictEqual(editorFactoryCalled, 0);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(!lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
        }
        // openEditors with >1 editor
        if (useOpenEditors) {
            // mix of untyped and typed editors
            {
                const untypedEditor1 = { resource: URI.file('file1.editor-service-override-tests') };
                const untypedEditor2 = { resource: URI.file('file2.editor-service-override-tests') };
                const untypedEditor3 = { editor: createTestFileEditorInput(URI.file('file3.editor-service-override-tests'), TEST_EDITOR_INPUT_ID) };
                const untypedEditor4 = { editor: createTestFileEditorInput(URI.file('file4.editor-service-override-tests'), TEST_EDITOR_INPUT_ID) };
                const untypedEditor5 = { resource: URI.file('file5.editor-service-override-tests') };
                const pane = (await service.openEditors([untypedEditor1, untypedEditor2, untypedEditor3, untypedEditor4, untypedEditor5]))[0];
                assert.strictEqual(pane?.group, rootGroup);
                assert.strictEqual(pane?.group.count, 5);
                // Only the untyped editors should have had factories called (3 untyped editors)
                assert.strictEqual(editorFactoryCalled, 3);
                assert.strictEqual(untitledEditorFactoryCalled, 0);
                assert.strictEqual(diffEditorFactoryCalled, 0);
                assert.ok(lastEditorFactoryEditor);
                assert.ok(!lastUntitledEditorFactoryEditor);
                assert.ok(!lastDiffEditorFactoryEditor);
                await resetTestState();
            }
        }
        // untyped default editor
        {
            // untyped default editor, options: revealIfVisible
            {
                const untypedEditor1 = { resource: URI.file('file-1'), options: { revealIfVisible: true, pinned: true } };
                const untypedEditor2 = { resource: URI.file('file-2'), options: { pinned: true } };
                const rootPane = await openEditor(untypedEditor1);
                const sidePane = await openEditor(untypedEditor2, SIDE_GROUP);
                assert.strictEqual(rootPane?.group.count, 1);
                assert.strictEqual(sidePane?.group.count, 1);
                accessor.editorGroupService.activateGroup(sidePane.group);
                await openEditor(untypedEditor1);
                assert.strictEqual(rootPane?.group.count, 1);
                assert.strictEqual(sidePane?.group.count, 1);
                await resetTestState();
            }
            // untyped default editor, options: revealIfOpened
            {
                const untypedEditor1 = { resource: URI.file('file-1'), options: { revealIfOpened: true, pinned: true } };
                const untypedEditor2 = { resource: URI.file('file-2'), options: { pinned: true } };
                const rootPane = await openEditor(untypedEditor1);
                await openEditor(untypedEditor2);
                assert.strictEqual(rootPane?.group.activeEditor?.resource?.toString(), untypedEditor2.resource.toString());
                const sidePane = await openEditor(untypedEditor2, SIDE_GROUP);
                assert.strictEqual(rootPane?.group.count, 2);
                assert.strictEqual(sidePane?.group.count, 1);
                accessor.editorGroupService.activateGroup(sidePane.group);
                await openEditor(untypedEditor1);
                assert.strictEqual(rootPane?.group.count, 2);
                assert.strictEqual(sidePane?.group.count, 1);
                await resetTestState();
            }
        }
    }
    test('openEditor() applies options if editor already opened', async () => {
        disposables.add(registerTestFileEditor());
        const [, service, accessor] = await createEditorService();
        disposables.add(accessor.editorResolverService.registerEditor('*.editor-service-override-tests', { id: TEST_EDITOR_INPUT_ID, label: 'Label', priority: RegisteredEditorPriority.exclusive }, {}, {
            createEditorInput: editor => ({ editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
        }));
        // Typed editor
        let pane = await service.openEditor(createTestFileEditorInput(URI.parse('my://resource-openEditors'), TEST_EDITOR_INPUT_ID));
        pane = await service.openEditor(createTestFileEditorInput(URI.parse('my://resource-openEditors'), TEST_EDITOR_INPUT_ID), { sticky: true, preserveFocus: true });
        assert.strictEqual(pane?.options?.sticky, true);
        assert.strictEqual(pane?.options?.preserveFocus, true);
        await pane.group.closeAllEditors();
        // Untyped editor (without registered editor)
        pane = await service.openEditor({ resource: URI.file('resource-openEditors') });
        pane = await service.openEditor({ resource: URI.file('resource-openEditors'), options: { sticky: true, preserveFocus: true } });
        assert.ok(pane instanceof TestTextFileEditor);
        assert.strictEqual(pane?.options?.sticky, true);
        assert.strictEqual(pane?.options?.preserveFocus, true);
        // Untyped editor (with registered editor)
        pane = await service.openEditor({ resource: URI.file('file.editor-service-override-tests') });
        pane = await service.openEditor({ resource: URI.file('file.editor-service-override-tests'), options: { sticky: true, preserveFocus: true } });
        assert.strictEqual(pane?.options?.sticky, true);
        assert.strictEqual(pane?.options?.preserveFocus, true);
    });
    test('isOpen() with side by side editor', async () => {
        const [part, service] = await createEditorService();
        const input = createTestFileEditorInput(URI.parse('my://resource-openEditors'), TEST_EDITOR_INPUT_ID);
        const otherInput = createTestFileEditorInput(URI.parse('my://resource2-openEditors'), TEST_EDITOR_INPUT_ID);
        const sideBySideInput = new SideBySideEditorInput('sideBySide', '', input, otherInput, service);
        const editor1 = await service.openEditor(sideBySideInput, { pinned: true });
        assert.strictEqual(part.activeGroup.count, 1);
        assert.strictEqual(service.isOpened(input), false);
        assert.strictEqual(service.isOpened(otherInput), true);
        assert.strictEqual(service.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), false);
        assert.strictEqual(service.isOpened({ resource: otherInput.resource, typeId: otherInput.typeId, editorId: otherInput.editorId }), true);
        const editor2 = await service.openEditor(input, { pinned: true });
        assert.strictEqual(part.activeGroup.count, 2);
        assert.strictEqual(service.isOpened(input), true);
        assert.strictEqual(service.isOpened(otherInput), true);
        assert.strictEqual(service.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), true);
        assert.strictEqual(service.isOpened({ resource: otherInput.resource, typeId: otherInput.typeId, editorId: otherInput.editorId }), true);
        await editor2?.group.closeEditor(input);
        assert.strictEqual(part.activeGroup.count, 1);
        assert.strictEqual(service.isOpened(input), false);
        assert.strictEqual(service.isOpened(otherInput), true);
        assert.strictEqual(service.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), false);
        assert.strictEqual(service.isOpened({ resource: otherInput.resource, typeId: otherInput.typeId, editorId: otherInput.editorId }), true);
        await editor1?.group.closeEditor(sideBySideInput);
        assert.strictEqual(service.isOpened(input), false);
        assert.strictEqual(service.isOpened(otherInput), false);
        assert.strictEqual(service.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), false);
        assert.strictEqual(service.isOpened({ resource: otherInput.resource, typeId: otherInput.typeId, editorId: otherInput.editorId }), false);
    });
    test('openEditors() / replaceEditors()', async () => {
        const [part, service] = await createEditorService();
        const input = createTestFileEditorInput(URI.parse('my://resource-openEditors'), TEST_EDITOR_INPUT_ID);
        const otherInput = createTestFileEditorInput(URI.parse('my://resource2-openEditors'), TEST_EDITOR_INPUT_ID);
        const replaceInput = createTestFileEditorInput(URI.parse('my://resource3-openEditors'), TEST_EDITOR_INPUT_ID);
        // Open editors
        await service.openEditors([{ editor: input }, { editor: otherInput }]);
        assert.strictEqual(part.activeGroup.count, 2);
        // Replace editors
        await service.replaceEditors([{ editor: input, replacement: replaceInput }], part.activeGroup);
        assert.strictEqual(part.activeGroup.count, 2);
        assert.strictEqual(part.activeGroup.getIndexOfEditor(replaceInput), 0);
    });
    test('openEditors() handles workspace trust (typed editors)', async () => {
        const [part, service, accessor] = await createEditorService();
        const input1 = createTestFileEditorInput(URI.parse('my://resource1-openEditors'), TEST_EDITOR_INPUT_ID);
        const input2 = createTestFileEditorInput(URI.parse('my://resource2-openEditors'), TEST_EDITOR_INPUT_ID);
        const input3 = createTestFileEditorInput(URI.parse('my://resource3-openEditors'), TEST_EDITOR_INPUT_ID);
        const input4 = createTestFileEditorInput(URI.parse('my://resource4-openEditors'), TEST_EDITOR_INPUT_ID);
        const sideBySideInput = new SideBySideEditorInput('side by side', undefined, input3, input4, service);
        const oldHandler = accessor.workspaceTrustRequestService.requestOpenUrisHandler;
        try {
            // Trust: cancel
            let trustEditorUris = [];
            accessor.workspaceTrustRequestService.requestOpenUrisHandler = async (uris) => {
                trustEditorUris = uris;
                return 3 /* WorkspaceTrustUriResponse.Cancel */;
            };
            await service.openEditors([{ editor: input1 }, { editor: input2 }, { editor: sideBySideInput }], undefined, { validateTrust: true });
            assert.strictEqual(part.activeGroup.count, 0);
            assert.strictEqual(trustEditorUris.length, 4);
            assert.strictEqual(trustEditorUris.some(uri => uri.toString() === input1.resource.toString()), true);
            assert.strictEqual(trustEditorUris.some(uri => uri.toString() === input2.resource.toString()), true);
            assert.strictEqual(trustEditorUris.some(uri => uri.toString() === input3.resource.toString()), true);
            assert.strictEqual(trustEditorUris.some(uri => uri.toString() === input4.resource.toString()), true);
            // Trust: open in new window
            accessor.workspaceTrustRequestService.requestOpenUrisHandler = async (uris) => 2 /* WorkspaceTrustUriResponse.OpenInNewWindow */;
            await service.openEditors([{ editor: input1 }, { editor: input2 }, { editor: sideBySideInput }], undefined, { validateTrust: true });
            assert.strictEqual(part.activeGroup.count, 0);
            // Trust: allow
            accessor.workspaceTrustRequestService.requestOpenUrisHandler = async (uris) => 1 /* WorkspaceTrustUriResponse.Open */;
            await service.openEditors([{ editor: input1 }, { editor: input2 }, { editor: sideBySideInput }], undefined, { validateTrust: true });
            assert.strictEqual(part.activeGroup.count, 3);
        }
        finally {
            accessor.workspaceTrustRequestService.requestOpenUrisHandler = oldHandler;
        }
    });
    test('openEditors() ignores trust when `validateTrust: false', async () => {
        const [part, service, accessor] = await createEditorService();
        const input1 = createTestFileEditorInput(URI.parse('my://resource1-openEditors'), TEST_EDITOR_INPUT_ID);
        const input2 = createTestFileEditorInput(URI.parse('my://resource2-openEditors'), TEST_EDITOR_INPUT_ID);
        const input3 = createTestFileEditorInput(URI.parse('my://resource3-openEditors'), TEST_EDITOR_INPUT_ID);
        const input4 = createTestFileEditorInput(URI.parse('my://resource4-openEditors'), TEST_EDITOR_INPUT_ID);
        const sideBySideInput = new SideBySideEditorInput('side by side', undefined, input3, input4, service);
        const oldHandler = accessor.workspaceTrustRequestService.requestOpenUrisHandler;
        try {
            // Trust: cancel
            accessor.workspaceTrustRequestService.requestOpenUrisHandler = async (uris) => 3 /* WorkspaceTrustUriResponse.Cancel */;
            await service.openEditors([{ editor: input1 }, { editor: input2 }, { editor: sideBySideInput }]);
            assert.strictEqual(part.activeGroup.count, 3);
        }
        finally {
            accessor.workspaceTrustRequestService.requestOpenUrisHandler = oldHandler;
        }
    });
    test('openEditors() extracts proper resources from untyped editors for workspace trust', async () => {
        const [, service, accessor] = await createEditorService();
        const input = { resource: URI.file('resource-openEditors') };
        const otherInput = {
            original: { resource: URI.parse('my://resource2-openEditors') },
            modified: { resource: URI.parse('my://resource3-openEditors') }
        };
        const oldHandler = accessor.workspaceTrustRequestService.requestOpenUrisHandler;
        try {
            let trustEditorUris = [];
            accessor.workspaceTrustRequestService.requestOpenUrisHandler = async (uris) => {
                trustEditorUris = uris;
                return oldHandler(uris);
            };
            await service.openEditors([input, otherInput], undefined, { validateTrust: true });
            assert.strictEqual(trustEditorUris.length, 3);
            assert.strictEqual(trustEditorUris.some(uri => uri.toString() === input.resource.toString()), true);
            assert.strictEqual(trustEditorUris.some(uri => uri.toString() === otherInput.original.resource?.toString()), true);
            assert.strictEqual(trustEditorUris.some(uri => uri.toString() === otherInput.modified.resource?.toString()), true);
        }
        finally {
            accessor.workspaceTrustRequestService.requestOpenUrisHandler = oldHandler;
        }
    });
    test('close editor does not dispose when editor opened in other group', async () => {
        const [part, service] = await createEditorService();
        const input = createTestFileEditorInput(URI.parse('my://resource-close1'), TEST_EDITOR_INPUT_ID);
        const rootGroup = part.activeGroup;
        const rightGroup = part.addGroup(rootGroup, 3 /* GroupDirection.RIGHT */);
        // Open input
        await service.openEditor(input, { pinned: true });
        await service.openEditor(input, { pinned: true }, rightGroup);
        const editors = service.editors;
        assert.strictEqual(editors.length, 2);
        assert.strictEqual(editors[0], input);
        assert.strictEqual(editors[1], input);
        // Close input
        await rootGroup.closeEditor(input);
        assert.strictEqual(input.isDisposed(), false);
        await rightGroup.closeEditor(input);
        assert.strictEqual(input.isDisposed(), true);
    });
    test('open to the side', async () => {
        const [part, service] = await createEditorService();
        const input1 = createTestFileEditorInput(URI.parse('my://resource1-openside'), TEST_EDITOR_INPUT_ID);
        const input2 = createTestFileEditorInput(URI.parse('my://resource2-openside'), TEST_EDITOR_INPUT_ID);
        const rootGroup = part.activeGroup;
        await service.openEditor(input1, { pinned: true }, rootGroup);
        let editor = await service.openEditor(input1, { pinned: true, preserveFocus: true }, SIDE_GROUP);
        assert.strictEqual(part.activeGroup, rootGroup);
        assert.strictEqual(part.count, 2);
        assert.strictEqual(editor?.group, part.groups[1]);
        assert.strictEqual(service.isVisible(input1), true);
        assert.strictEqual(service.isOpened(input1), true);
        // Open to the side uses existing neighbour group if any
        editor = await service.openEditor(input2, { pinned: true, preserveFocus: true }, SIDE_GROUP);
        assert.strictEqual(part.activeGroup, rootGroup);
        assert.strictEqual(part.count, 2);
        assert.strictEqual(editor?.group, part.groups[1]);
        assert.strictEqual(service.isVisible(input2), true);
        assert.strictEqual(service.isOpened(input2), true);
    });
    test('editor group activation', async () => {
        const [part, service] = await createEditorService();
        const input1 = createTestFileEditorInput(URI.parse('my://resource1-openside'), TEST_EDITOR_INPUT_ID);
        const input2 = createTestFileEditorInput(URI.parse('my://resource2-openside'), TEST_EDITOR_INPUT_ID);
        const rootGroup = part.activeGroup;
        await service.openEditor(input1, { pinned: true }, rootGroup);
        let editor = await service.openEditor(input2, { pinned: true, preserveFocus: true, activation: EditorActivation.ACTIVATE }, SIDE_GROUP);
        const sideGroup = editor?.group;
        assert.strictEqual(part.activeGroup, sideGroup);
        editor = await service.openEditor(input1, { pinned: true, preserveFocus: true, activation: EditorActivation.PRESERVE }, rootGroup);
        assert.strictEqual(part.activeGroup, sideGroup);
        editor = await service.openEditor(input1, { pinned: true, preserveFocus: true, activation: EditorActivation.ACTIVATE }, rootGroup);
        assert.strictEqual(part.activeGroup, rootGroup);
        editor = await service.openEditor(input2, { pinned: true, activation: EditorActivation.PRESERVE }, sideGroup);
        assert.strictEqual(part.activeGroup, rootGroup);
        editor = await service.openEditor(input2, { pinned: true, activation: EditorActivation.ACTIVATE }, sideGroup);
        assert.strictEqual(part.activeGroup, sideGroup);
        part.arrangeGroups(1 /* GroupsArrangement.EXPAND */);
        editor = await service.openEditor(input1, { pinned: true, preserveFocus: true, activation: EditorActivation.RESTORE }, rootGroup);
        assert.strictEqual(part.activeGroup, sideGroup);
    });
    test('inactive editor group does not activate when closing editor (#117686)', async () => {
        const [part, service] = await createEditorService();
        const input1 = createTestFileEditorInput(URI.parse('my://resource1-openside'), TEST_EDITOR_INPUT_ID);
        const input2 = createTestFileEditorInput(URI.parse('my://resource2-openside'), TEST_EDITOR_INPUT_ID);
        const rootGroup = part.activeGroup;
        await service.openEditor(input1, { pinned: true }, rootGroup);
        await service.openEditor(input2, { pinned: true }, rootGroup);
        const sideGroup = (await service.openEditor(input2, { pinned: true }, SIDE_GROUP))?.group;
        assert.strictEqual(part.activeGroup, sideGroup);
        assert.notStrictEqual(rootGroup, sideGroup);
        part.arrangeGroups(1 /* GroupsArrangement.EXPAND */, part.activeGroup);
        await rootGroup.closeEditor(input2);
        assert.strictEqual(part.activeGroup, sideGroup);
        assert(!part.isGroupExpanded(rootGroup));
        assert(part.isGroupExpanded(part.activeGroup));
    });
    test('active editor change / visible editor change events', async function () {
        const [part, service] = await createEditorService();
        let input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
        let otherInput = createTestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
        let activeEditorChangeEventFired = false;
        const activeEditorChangeListener = service.onDidActiveEditorChange(() => {
            activeEditorChangeEventFired = true;
        });
        let visibleEditorChangeEventFired = false;
        const visibleEditorChangeListener = service.onDidVisibleEditorsChange(() => {
            visibleEditorChangeEventFired = true;
        });
        function assertActiveEditorChangedEvent(expected) {
            assert.strictEqual(activeEditorChangeEventFired, expected, `Unexpected active editor change state (got ${activeEditorChangeEventFired}, expected ${expected})`);
            activeEditorChangeEventFired = false;
        }
        function assertVisibleEditorsChangedEvent(expected) {
            assert.strictEqual(visibleEditorChangeEventFired, expected, `Unexpected visible editors change state (got ${visibleEditorChangeEventFired}, expected ${expected})`);
            visibleEditorChangeEventFired = false;
        }
        async function closeEditorAndWaitForNextToOpen(group, input) {
            await group.closeEditor(input);
            await timeout(0); // closing an editor will not immediately open the next one, so we need to wait
        }
        // 1.) open, open same, open other, close
        let editor = await service.openEditor(input, { pinned: true });
        const group = editor?.group;
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        editor = await service.openEditor(input);
        assertActiveEditorChangedEvent(false);
        assertVisibleEditorsChangedEvent(false);
        editor = await service.openEditor(otherInput);
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        await closeEditorAndWaitForNextToOpen(group, otherInput);
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        await closeEditorAndWaitForNextToOpen(group, input);
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        // 2.) open, open same (forced open) (recreate inputs that got disposed)
        input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
        otherInput = createTestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
        editor = await service.openEditor(input);
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        editor = await service.openEditor(input, { forceReload: true });
        assertActiveEditorChangedEvent(false);
        assertVisibleEditorsChangedEvent(false);
        await closeEditorAndWaitForNextToOpen(group, input);
        // 3.) open, open inactive, close (recreate inputs that got disposed)
        input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
        otherInput = createTestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
        editor = await service.openEditor(input, { pinned: true });
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        editor = await service.openEditor(otherInput, { inactive: true });
        assertActiveEditorChangedEvent(false);
        assertVisibleEditorsChangedEvent(false);
        await group.closeAllEditors();
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        // 4.) open, open inactive, close inactive (recreate inputs that got disposed)
        input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
        otherInput = createTestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
        editor = await service.openEditor(input, { pinned: true });
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        editor = await service.openEditor(otherInput, { inactive: true });
        assertActiveEditorChangedEvent(false);
        assertVisibleEditorsChangedEvent(false);
        await closeEditorAndWaitForNextToOpen(group, otherInput);
        assertActiveEditorChangedEvent(false);
        assertVisibleEditorsChangedEvent(false);
        await group.closeAllEditors();
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        // 5.) add group, remove group (recreate inputs that got disposed)
        input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
        otherInput = createTestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
        editor = await service.openEditor(input, { pinned: true });
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        let rightGroup = part.addGroup(part.activeGroup, 3 /* GroupDirection.RIGHT */);
        assertActiveEditorChangedEvent(false);
        assertVisibleEditorsChangedEvent(false);
        rightGroup.focus();
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(false);
        part.removeGroup(rightGroup);
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(false);
        await group.closeAllEditors();
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        // 6.) open editor in inactive group (recreate inputs that got disposed)
        input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
        otherInput = createTestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
        editor = await service.openEditor(input, { pinned: true });
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        rightGroup = part.addGroup(part.activeGroup, 3 /* GroupDirection.RIGHT */);
        assertActiveEditorChangedEvent(false);
        assertVisibleEditorsChangedEvent(false);
        await rightGroup.openEditor(otherInput);
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        await closeEditorAndWaitForNextToOpen(rightGroup, otherInput);
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        await group.closeAllEditors();
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        // 7.) activate group (recreate inputs that got disposed)
        input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
        otherInput = createTestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
        editor = await service.openEditor(input, { pinned: true });
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        rightGroup = part.addGroup(part.activeGroup, 3 /* GroupDirection.RIGHT */);
        assertActiveEditorChangedEvent(false);
        assertVisibleEditorsChangedEvent(false);
        await rightGroup.openEditor(otherInput);
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        group.focus();
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(false);
        await closeEditorAndWaitForNextToOpen(rightGroup, otherInput);
        assertActiveEditorChangedEvent(false);
        assertVisibleEditorsChangedEvent(true);
        await group.closeAllEditors();
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        // 8.) move editor (recreate inputs that got disposed)
        input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
        otherInput = createTestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
        editor = await service.openEditor(input, { pinned: true });
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        editor = await service.openEditor(otherInput, { pinned: true });
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        group.moveEditor(otherInput, group, { index: 0 });
        assertActiveEditorChangedEvent(false);
        assertVisibleEditorsChangedEvent(false);
        await group.closeAllEditors();
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        // 9.) close editor in inactive group (recreate inputs that got disposed)
        input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
        otherInput = createTestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
        editor = await service.openEditor(input, { pinned: true });
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        rightGroup = part.addGroup(part.activeGroup, 3 /* GroupDirection.RIGHT */);
        assertActiveEditorChangedEvent(false);
        assertVisibleEditorsChangedEvent(false);
        await rightGroup.openEditor(otherInput);
        assertActiveEditorChangedEvent(true);
        assertVisibleEditorsChangedEvent(true);
        await closeEditorAndWaitForNextToOpen(group, input);
        assertActiveEditorChangedEvent(false);
        assertVisibleEditorsChangedEvent(true);
        // cleanup
        activeEditorChangeListener.dispose();
        visibleEditorChangeListener.dispose();
    });
    test('editors change event', async function () {
        const [part, service] = await createEditorService();
        const rootGroup = part.activeGroup;
        let input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
        let otherInput = createTestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
        let editorsChangeEventCounter = 0;
        async function assertEditorsChangeEvent(fn, expected) {
            const p = Event.toPromise(service.onDidEditorsChange);
            await fn();
            await p;
            editorsChangeEventCounter++;
            assert.strictEqual(editorsChangeEventCounter, expected);
        }
        // open
        await assertEditorsChangeEvent(() => service.openEditor(input, { pinned: true }), 1);
        // open (other)
        await assertEditorsChangeEvent(() => service.openEditor(otherInput, { pinned: true }), 2);
        // close (inactive)
        await assertEditorsChangeEvent(() => rootGroup.closeEditor(input), 3);
        // close (active)
        await assertEditorsChangeEvent(() => rootGroup.closeEditor(otherInput), 4);
        input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
        otherInput = createTestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
        // open editors
        await assertEditorsChangeEvent(() => service.openEditors([{ editor: input, options: { pinned: true } }, { editor: otherInput, options: { pinned: true } }]), 5);
        // active editor change
        await assertEditorsChangeEvent(() => service.openEditor(otherInput), 6);
        // move editor (in group)
        await assertEditorsChangeEvent(() => service.openEditor(input, { pinned: true, index: 1 }), 7);
        const rightGroup = part.addGroup(part.activeGroup, 3 /* GroupDirection.RIGHT */);
        await assertEditorsChangeEvent(async () => rootGroup.moveEditor(input, rightGroup), 8);
        // move group
        await assertEditorsChangeEvent(async () => part.moveGroup(rightGroup, rootGroup, 2 /* GroupDirection.LEFT */), 9);
    });
    test('two active editor change events when opening editor to the side', async function () {
        const [, service] = await createEditorService();
        const input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
        let activeEditorChangeEvents = 0;
        const activeEditorChangeListener = service.onDidActiveEditorChange(() => {
            activeEditorChangeEvents++;
        });
        function assertActiveEditorChangedEvent(expected) {
            assert.strictEqual(activeEditorChangeEvents, expected, `Unexpected active editor change state (got ${activeEditorChangeEvents}, expected ${expected})`);
            activeEditorChangeEvents = 0;
        }
        await service.openEditor(input, { pinned: true });
        assertActiveEditorChangedEvent(1);
        await service.openEditor(input, { pinned: true }, SIDE_GROUP);
        // we expect 2 active editor change events: one for the fact that the
        // active editor is now in the side group but also one for when the
        // editor has finished loading. we used to ignore that second change
        // event, however many listeners are interested on the active editor
        // when it has fully loaded (e.g. a model is set). as such, we cannot
        // simply ignore that second event from the editor service, even though
        // the actual editor input is the same
        assertActiveEditorChangedEvent(2);
        // cleanup
        activeEditorChangeListener.dispose();
    });
    test('activeTextEditorControl / activeTextEditorMode', async () => {
        const [, service] = await createEditorService();
        // Open untitled input
        const editor = await service.openEditor({ resource: undefined });
        assert.strictEqual(service.activeEditorPane, editor);
        assert.strictEqual(service.activeTextEditorControl, editor?.getControl());
        assert.strictEqual(service.activeTextEditorLanguageId, PLAINTEXT_LANGUAGE_ID);
    });
    test('openEditor returns undefined when inactive', async function () {
        const [, service] = await createEditorService();
        const input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
        const otherInput = createTestFileEditorInput(URI.parse('my://resource2-inactive'), TEST_EDITOR_INPUT_ID);
        const editor = await service.openEditor(input, { pinned: true });
        assert.ok(editor);
        const otherEditor = await service.openEditor(otherInput, { inactive: true });
        assert.ok(!otherEditor);
    });
    test('openEditor shows placeholder when opening fails', async function () {
        const [, service] = await createEditorService();
        const failingInput = createTestFileEditorInput(URI.parse('my://resource-failing'), TEST_EDITOR_INPUT_ID);
        failingInput.setFailToOpen();
        const failingEditor = await service.openEditor(failingInput);
        assert.ok(failingEditor instanceof ErrorPlaceholderEditor);
    });
    test('openEditor shows placeholder when restoring fails', async function () {
        const [, service] = await createEditorService();
        const input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
        const failingInput = createTestFileEditorInput(URI.parse('my://resource-failing'), TEST_EDITOR_INPUT_ID);
        await service.openEditor(input, { pinned: true });
        await service.openEditor(failingInput, { inactive: true });
        failingInput.setFailToOpen();
        const failingEditor = await service.openEditor(failingInput);
        assert.ok(failingEditor instanceof ErrorPlaceholderEditor);
    });
    test('save, saveAll, revertAll', async function () {
        const [part, service] = await createEditorService();
        const input1 = createTestFileEditorInput(URI.parse('my://resource1'), TEST_EDITOR_INPUT_ID);
        input1.dirty = true;
        const input2 = createTestFileEditorInput(URI.parse('my://resource2'), TEST_EDITOR_INPUT_ID);
        input2.dirty = true;
        const sameInput1 = createTestFileEditorInput(URI.parse('my://resource1'), TEST_EDITOR_INPUT_ID);
        sameInput1.dirty = true;
        const rootGroup = part.activeGroup;
        await service.openEditor(input1, { pinned: true });
        await service.openEditor(input2, { pinned: true });
        await service.openEditor(sameInput1, { pinned: true }, SIDE_GROUP);
        const res1 = await service.save({ groupId: rootGroup.id, editor: input1 });
        assert.strictEqual(res1.success, true);
        assert.strictEqual(res1.editors[0], input1);
        assert.strictEqual(input1.gotSaved, true);
        input1.gotSaved = false;
        input1.gotSavedAs = false;
        input1.gotReverted = false;
        input1.dirty = true;
        input2.dirty = true;
        sameInput1.dirty = true;
        const res2 = await service.save({ groupId: rootGroup.id, editor: input1 }, { saveAs: true });
        assert.strictEqual(res2.success, true);
        assert.strictEqual(res2.editors[0], input1);
        assert.strictEqual(input1.gotSavedAs, true);
        input1.gotSaved = false;
        input1.gotSavedAs = false;
        input1.gotReverted = false;
        input1.dirty = true;
        input2.dirty = true;
        sameInput1.dirty = true;
        const revertRes = await service.revertAll();
        assert.strictEqual(revertRes, true);
        assert.strictEqual(input1.gotReverted, true);
        input1.gotSaved = false;
        input1.gotSavedAs = false;
        input1.gotReverted = false;
        input1.dirty = true;
        input2.dirty = true;
        sameInput1.dirty = true;
        const res3 = await service.saveAll();
        assert.strictEqual(res3.success, true);
        assert.strictEqual(res3.editors.length, 2);
        assert.strictEqual(input1.gotSaved, true);
        assert.strictEqual(input2.gotSaved, true);
        input1.gotSaved = false;
        input1.gotSavedAs = false;
        input1.gotReverted = false;
        input2.gotSaved = false;
        input2.gotSavedAs = false;
        input2.gotReverted = false;
        input1.dirty = true;
        input2.dirty = true;
        sameInput1.dirty = true;
        await service.saveAll({ saveAs: true });
        assert.strictEqual(input1.gotSavedAs, true);
        assert.strictEqual(input2.gotSavedAs, true);
        // services dedupes inputs automatically
        assert.strictEqual(sameInput1.gotSaved, false);
        assert.strictEqual(sameInput1.gotSavedAs, false);
        assert.strictEqual(sameInput1.gotReverted, false);
    });
    test('saveAll, revertAll (sticky editor)', async function () {
        const [, service] = await createEditorService();
        const input1 = createTestFileEditorInput(URI.parse('my://resource1'), TEST_EDITOR_INPUT_ID);
        input1.dirty = true;
        const input2 = createTestFileEditorInput(URI.parse('my://resource2'), TEST_EDITOR_INPUT_ID);
        input2.dirty = true;
        const sameInput1 = createTestFileEditorInput(URI.parse('my://resource1'), TEST_EDITOR_INPUT_ID);
        sameInput1.dirty = true;
        await service.openEditor(input1, { pinned: true, sticky: true });
        await service.openEditor(input2, { pinned: true });
        await service.openEditor(sameInput1, { pinned: true }, SIDE_GROUP);
        const revertRes = await service.revertAll({ excludeSticky: true });
        assert.strictEqual(revertRes, true);
        assert.strictEqual(input1.gotReverted, false);
        assert.strictEqual(sameInput1.gotReverted, true);
        input1.gotSaved = false;
        input1.gotSavedAs = false;
        input1.gotReverted = false;
        sameInput1.gotSaved = false;
        sameInput1.gotSavedAs = false;
        sameInput1.gotReverted = false;
        input1.dirty = true;
        input2.dirty = true;
        sameInput1.dirty = true;
        const saveRes = await service.saveAll({ excludeSticky: true });
        assert.strictEqual(saveRes.success, true);
        assert.strictEqual(saveRes.editors.length, 2);
        assert.strictEqual(input1.gotSaved, false);
        assert.strictEqual(input2.gotSaved, true);
        assert.strictEqual(sameInput1.gotSaved, true);
    });
    test('saveAll, revertAll untitled (exclude untitled)', async function () {
        await testSaveRevertUntitled({}, false, false);
        await testSaveRevertUntitled({ includeUntitled: false }, false, false);
    });
    test('saveAll, revertAll untitled (include untitled)', async function () {
        await testSaveRevertUntitled({ includeUntitled: true }, true, false);
        await testSaveRevertUntitled({ includeUntitled: { includeScratchpad: false } }, true, false);
    });
    test('saveAll, revertAll untitled (include scratchpad)', async function () {
        await testSaveRevertUntitled({ includeUntitled: { includeScratchpad: true } }, true, true);
    });
    async function testSaveRevertUntitled(options, expectUntitled, expectScratchpad) {
        const [, service] = await createEditorService();
        const input1 = createTestFileEditorInput(URI.parse('my://resource1'), TEST_EDITOR_INPUT_ID);
        input1.dirty = true;
        const untitledInput = createTestFileEditorInput(URI.parse('my://resource2'), TEST_EDITOR_INPUT_ID);
        untitledInput.dirty = true;
        untitledInput.capabilities = 4 /* EditorInputCapabilities.Untitled */;
        const scratchpadInput = createTestFileEditorInput(URI.parse('my://resource3'), TEST_EDITOR_INPUT_ID);
        scratchpadInput.modified = true;
        scratchpadInput.capabilities = 512 /* EditorInputCapabilities.Scratchpad */ | 4 /* EditorInputCapabilities.Untitled */;
        await service.openEditor(input1, { pinned: true, sticky: true });
        await service.openEditor(untitledInput, { pinned: true });
        await service.openEditor(scratchpadInput, { pinned: true });
        const revertRes = await service.revertAll(options);
        assert.strictEqual(revertRes, true);
        assert.strictEqual(input1.gotReverted, true);
        assert.strictEqual(untitledInput.gotReverted, expectUntitled);
        assert.strictEqual(scratchpadInput.gotReverted, expectScratchpad);
        input1.gotSaved = false;
        untitledInput.gotSavedAs = false;
        scratchpadInput.gotReverted = false;
        input1.gotSaved = false;
        untitledInput.gotSavedAs = false;
        scratchpadInput.gotReverted = false;
        input1.dirty = true;
        untitledInput.dirty = true;
        scratchpadInput.modified = true;
        const saveRes = await service.saveAll(options);
        assert.strictEqual(saveRes.success, true);
        assert.strictEqual(saveRes.editors.length, expectScratchpad ? 3 : expectUntitled ? 2 : 1);
        assert.strictEqual(input1.gotSaved, true);
        assert.strictEqual(untitledInput.gotSaved, expectUntitled);
        assert.strictEqual(scratchpadInput.gotSaved, expectScratchpad);
    }
    test('file delete closes editor', async function () {
        return testFileDeleteEditorClose(false);
    });
    test('file delete leaves dirty editors open', function () {
        return testFileDeleteEditorClose(true);
    });
    async function testFileDeleteEditorClose(dirty) {
        const [part, service, accessor] = await createEditorService();
        const input1 = createTestFileEditorInput(URI.parse('my://resource1'), TEST_EDITOR_INPUT_ID);
        input1.dirty = dirty;
        const input2 = createTestFileEditorInput(URI.parse('my://resource2'), TEST_EDITOR_INPUT_ID);
        input2.dirty = dirty;
        const rootGroup = part.activeGroup;
        await service.openEditor(input1, { pinned: true });
        await service.openEditor(input2, { pinned: true });
        assert.strictEqual(rootGroup.activeEditor, input2);
        const activeEditorChangePromise = awaitActiveEditorChange(service);
        accessor.fileService.fireAfterOperation(new FileOperationEvent(input2.resource, 1 /* FileOperation.DELETE */));
        if (!dirty) {
            await activeEditorChangePromise;
        }
        if (dirty) {
            assert.strictEqual(rootGroup.activeEditor, input2);
        }
        else {
            assert.strictEqual(rootGroup.activeEditor, input1);
        }
    }
    test('file move asks input to move', async function () {
        const [part, service, accessor] = await createEditorService();
        const input1 = createTestFileEditorInput(URI.parse('my://resource1'), TEST_EDITOR_INPUT_ID);
        const movedInput = createTestFileEditorInput(URI.parse('my://resource2'), TEST_EDITOR_INPUT_ID);
        input1.movedEditor = { editor: movedInput };
        const rootGroup = part.activeGroup;
        await service.openEditor(input1, { pinned: true });
        const activeEditorChangePromise = awaitActiveEditorChange(service);
        accessor.fileService.fireAfterOperation(new FileOperationEvent(input1.resource, 2 /* FileOperation.MOVE */, {
            resource: movedInput.resource,
            ctime: 0,
            etag: '',
            isDirectory: false,
            isFile: true,
            mtime: 0,
            name: 'resource2',
            size: 0,
            isSymbolicLink: false,
            readonly: false,
            locked: false,
            executable: false,
            children: undefined
        }));
        await activeEditorChangePromise;
        assert.strictEqual(rootGroup.activeEditor, movedInput);
    });
    function awaitActiveEditorChange(editorService) {
        return Event.toPromise(Event.once(editorService.onDidActiveEditorChange));
    }
    test('file watcher gets installed for out of workspace files', async function () {
        const [, service, accessor] = await createEditorService();
        const input1 = createTestFileEditorInput(URI.parse('file://resource1'), TEST_EDITOR_INPUT_ID);
        const input2 = createTestFileEditorInput(URI.parse('file://resource2'), TEST_EDITOR_INPUT_ID);
        await service.openEditor(input1, { pinned: true });
        assert.strictEqual(accessor.fileService.watches.length, 1);
        assert.strictEqual(accessor.fileService.watches[0].toString(), input1.resource.toString());
        const editor = await service.openEditor(input2, { pinned: true });
        assert.strictEqual(accessor.fileService.watches.length, 1);
        assert.strictEqual(accessor.fileService.watches[0].toString(), input2.resource.toString());
        await editor?.group.closeAllEditors();
        assert.strictEqual(accessor.fileService.watches.length, 0);
    });
    test('activeEditorPane scopedContextKeyService', async function () {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        const [part, service] = await createEditorService(instantiationService);
        const input1 = createTestFileEditorInput(URI.parse('file://resource1'), TEST_EDITOR_INPUT_ID);
        createTestFileEditorInput(URI.parse('file://resource2'), TEST_EDITOR_INPUT_ID);
        await service.openEditor(input1, { pinned: true });
        const editorContextKeyService = service.activeEditorPane?.scopedContextKeyService;
        assert.ok(!!editorContextKeyService);
        assert.strictEqual(editorContextKeyService, part.activeGroup.activeEditorPane?.scopedContextKeyService);
    });
    test('editorResolverService - openEditor', async function () {
        const [, service, accessor] = await createEditorService();
        const editorResolverService = accessor.editorResolverService;
        const textEditorService = accessor.textEditorService;
        let editorCount = 0;
        const registrationDisposable = editorResolverService.registerEditor('*.md', {
            id: 'TestEditor',
            label: 'Test Editor',
            detail: 'Test Editor Provider',
            priority: RegisteredEditorPriority.builtin
        }, {}, {
            createEditorInput: (editorInput) => {
                editorCount++;
                return ({ editor: textEditorService.createTextEditor(editorInput) });
            },
            createDiffEditorInput: diffEditor => ({ editor: textEditorService.createTextEditor(diffEditor) })
        });
        assert.strictEqual(editorCount, 0);
        const input1 = { resource: URI.parse('file://test/path/resource1.txt') };
        const input2 = { resource: URI.parse('file://test/path/resource1.md') };
        // Open editor input 1 and it shouln't trigger override as the glob doesn't match
        await service.openEditor(input1);
        assert.strictEqual(editorCount, 0);
        // Open editor input 2 and it should trigger override as the glob doesn match
        await service.openEditor(input2);
        assert.strictEqual(editorCount, 1);
        // Because we specify an override we shouldn't see it triggered even if it matches
        await service.openEditor({ ...input2, options: { override: 'default' } });
        assert.strictEqual(editorCount, 1);
        registrationDisposable.dispose();
    });
    test('editorResolverService - openEditors', async function () {
        const [, service, accessor] = await createEditorService();
        const editorResolverService = accessor.editorResolverService;
        const textEditorService = accessor.textEditorService;
        let editorCount = 0;
        const registrationDisposable = editorResolverService.registerEditor('*.md', {
            id: 'TestEditor',
            label: 'Test Editor',
            detail: 'Test Editor Provider',
            priority: RegisteredEditorPriority.builtin
        }, {}, {
            createEditorInput: (editorInput) => {
                editorCount++;
                return ({ editor: textEditorService.createTextEditor(editorInput) });
            },
            createDiffEditorInput: diffEditor => ({ editor: textEditorService.createTextEditor(diffEditor) })
        });
        assert.strictEqual(editorCount, 0);
        const input1 = createTestFileEditorInput(URI.parse('file://test/path/resource1.txt'), TEST_EDITOR_INPUT_ID).toUntyped();
        const input2 = createTestFileEditorInput(URI.parse('file://test/path/resource2.txt'), TEST_EDITOR_INPUT_ID).toUntyped();
        const input3 = createTestFileEditorInput(URI.parse('file://test/path/resource3.md'), TEST_EDITOR_INPUT_ID).toUntyped();
        const input4 = createTestFileEditorInput(URI.parse('file://test/path/resource4.md'), TEST_EDITOR_INPUT_ID).toUntyped();
        assert.ok(input1);
        assert.ok(input2);
        assert.ok(input3);
        assert.ok(input4);
        // Open editor inputs
        await service.openEditors([input1, input2, input3, input4]);
        // Only two matched the factory glob
        assert.strictEqual(editorCount, 2);
        registrationDisposable.dispose();
    });
    test('editorResolverService - replaceEditors', async function () {
        const [part, service, accessor] = await createEditorService();
        const editorResolverService = accessor.editorResolverService;
        const textEditorService = accessor.textEditorService;
        let editorCount = 0;
        const registrationDisposable = editorResolverService.registerEditor('*.md', {
            id: 'TestEditor',
            label: 'Test Editor',
            detail: 'Test Editor Provider',
            priority: RegisteredEditorPriority.builtin
        }, {}, {
            createEditorInput: (editorInput) => {
                editorCount++;
                return ({ editor: textEditorService.createTextEditor(editorInput) });
            },
            createDiffEditorInput: diffEditor => ({ editor: textEditorService.createTextEditor(diffEditor) })
        });
        assert.strictEqual(editorCount, 0);
        const input1 = createTestFileEditorInput(URI.parse('file://test/path/resource2.md'), TEST_EDITOR_INPUT_ID);
        const untypedInput1 = input1.toUntyped();
        assert.ok(untypedInput1);
        // Open editor input 1 and it shouldn't trigger because typed inputs aren't overriden
        await service.openEditor(input1);
        assert.strictEqual(editorCount, 0);
        await service.replaceEditors([{
                editor: input1,
                replacement: untypedInput1,
            }], part.activeGroup);
        assert.strictEqual(editorCount, 1);
        registrationDisposable.dispose();
    });
    test('closeEditor', async () => {
        const [part, service] = await createEditorService();
        const input = createTestFileEditorInput(URI.parse('my://resource-openEditors'), TEST_EDITOR_INPUT_ID);
        const otherInput = createTestFileEditorInput(URI.parse('my://resource2-openEditors'), TEST_EDITOR_INPUT_ID);
        // Open editors
        await service.openEditors([{ editor: input }, { editor: otherInput }]);
        assert.strictEqual(part.activeGroup.count, 2);
        // Close editor
        await service.closeEditor({ editor: input, groupId: part.activeGroup.id });
        assert.strictEqual(part.activeGroup.count, 1);
        await service.closeEditor({ editor: input, groupId: part.activeGroup.id });
        assert.strictEqual(part.activeGroup.count, 1);
        await service.closeEditor({ editor: otherInput, groupId: part.activeGroup.id });
        assert.strictEqual(part.activeGroup.count, 0);
        await service.closeEditor({ editor: otherInput, groupId: 999 });
        assert.strictEqual(part.activeGroup.count, 0);
    });
    test('closeEditors', async () => {
        const [part, service] = await createEditorService();
        const input = createTestFileEditorInput(URI.parse('my://resource-openEditors'), TEST_EDITOR_INPUT_ID);
        const otherInput = createTestFileEditorInput(URI.parse('my://resource2-openEditors'), TEST_EDITOR_INPUT_ID);
        // Open editors
        await service.openEditors([{ editor: input }, { editor: otherInput }]);
        assert.strictEqual(part.activeGroup.count, 2);
        // Close editors
        await service.closeEditors([{ editor: input, groupId: part.activeGroup.id }, { editor: otherInput, groupId: part.activeGroup.id }]);
        assert.strictEqual(part.activeGroup.count, 0);
    });
    test('findEditors (in group)', async () => {
        const [part, service] = await createEditorService();
        const input = createTestFileEditorInput(URI.parse('my://resource-openEditors'), TEST_EDITOR_INPUT_ID);
        const otherInput = createTestFileEditorInput(URI.parse('my://resource2-openEditors'), TEST_EDITOR_INPUT_ID);
        // Open editors
        await service.openEditors([{ editor: input }, { editor: otherInput }]);
        assert.strictEqual(part.activeGroup.count, 2);
        // Try using find editors for opened editors
        {
            const found1 = service.findEditors(input.resource, undefined, part.activeGroup);
            assert.strictEqual(found1.length, 1);
            assert.strictEqual(found1[0], input);
            const found2 = service.findEditors(input, undefined, part.activeGroup);
            assert.strictEqual(found2, input);
        }
        {
            const found1 = service.findEditors(otherInput.resource, undefined, part.activeGroup);
            assert.strictEqual(found1.length, 1);
            assert.strictEqual(found1[0], otherInput);
            const found2 = service.findEditors(otherInput, undefined, part.activeGroup);
            assert.strictEqual(found2, otherInput);
        }
        // Make sure we don't find non-opened editors
        {
            const found1 = service.findEditors(URI.parse('my://no-such-resource'), undefined, part.activeGroup);
            assert.strictEqual(found1.length, 0);
            const found2 = service.findEditors({ resource: URI.parse('my://no-such-resource'), typeId: '', editorId: TEST_EDITOR_INPUT_ID }, undefined, part.activeGroup);
            assert.strictEqual(found2, undefined);
        }
        // Make sure we don't find editors across groups
        {
            const newEditor = await service.openEditor(createTestFileEditorInput(URI.parse('my://other-group-resource'), TEST_EDITOR_INPUT_ID), { pinned: true, preserveFocus: true }, SIDE_GROUP);
            const found1 = service.findEditors(input.resource, undefined, newEditor.group.id);
            assert.strictEqual(found1.length, 0);
            const found2 = service.findEditors(input, undefined, newEditor.group.id);
            assert.strictEqual(found2, undefined);
        }
        // Check we don't find editors after closing them
        await part.activeGroup.closeAllEditors();
        {
            const found1 = service.findEditors(input.resource, undefined, part.activeGroup);
            assert.strictEqual(found1.length, 0);
            const found2 = service.findEditors(input, undefined, part.activeGroup);
            assert.strictEqual(found2, undefined);
        }
    });
    test('findEditors (across groups)', async () => {
        const [part, service] = await createEditorService();
        const rootGroup = part.activeGroup;
        const input = createTestFileEditorInput(URI.parse('my://resource-openEditors'), TEST_EDITOR_INPUT_ID);
        const otherInput = createTestFileEditorInput(URI.parse('my://resource2-openEditors'), TEST_EDITOR_INPUT_ID);
        // Open editors
        await service.openEditors([{ editor: input }, { editor: otherInput }]);
        const sideEditor = await service.openEditor(input, { pinned: true }, SIDE_GROUP);
        // Try using find editors for opened editors
        {
            const found1 = service.findEditors(input.resource);
            assert.strictEqual(found1.length, 2);
            assert.strictEqual(found1[0].editor, input);
            assert.strictEqual(found1[0].groupId, sideEditor?.group.id);
            assert.strictEqual(found1[1].editor, input);
            assert.strictEqual(found1[1].groupId, rootGroup.id);
            const found2 = service.findEditors(input);
            assert.strictEqual(found2.length, 2);
            assert.strictEqual(found2[0].editor, input);
            assert.strictEqual(found2[0].groupId, sideEditor?.group.id);
            assert.strictEqual(found2[1].editor, input);
            assert.strictEqual(found2[1].groupId, rootGroup.id);
        }
        {
            const found1 = service.findEditors(otherInput.resource);
            assert.strictEqual(found1.length, 1);
            assert.strictEqual(found1[0].editor, otherInput);
            assert.strictEqual(found1[0].groupId, rootGroup.id);
            const found2 = service.findEditors(otherInput);
            assert.strictEqual(found2.length, 1);
            assert.strictEqual(found2[0].editor, otherInput);
            assert.strictEqual(found2[0].groupId, rootGroup.id);
        }
        // Make sure we don't find non-opened editors
        {
            const found1 = service.findEditors(URI.parse('my://no-such-resource'));
            assert.strictEqual(found1.length, 0);
            const found2 = service.findEditors({ resource: URI.parse('my://no-such-resource'), typeId: '', editorId: TEST_EDITOR_INPUT_ID });
            assert.strictEqual(found2.length, 0);
        }
        // Check we don't find editors after closing them
        await rootGroup.closeAllEditors();
        await sideEditor?.group.closeAllEditors();
        {
            const found1 = service.findEditors(input.resource);
            assert.strictEqual(found1.length, 0);
            const found2 = service.findEditors(input);
            assert.strictEqual(found2.length, 0);
        }
    });
    test('findEditors (support side by side via options)', async () => {
        const [, service] = await createEditorService();
        const secondaryInput = createTestFileEditorInput(URI.parse('my://resource-findEditors-secondary'), TEST_EDITOR_INPUT_ID);
        const primaryInput = createTestFileEditorInput(URI.parse('my://resource-findEditors-primary'), TEST_EDITOR_INPUT_ID);
        const sideBySideInput = new SideBySideEditorInput(undefined, undefined, secondaryInput, primaryInput, service);
        await service.openEditor(sideBySideInput, { pinned: true });
        let foundEditors = service.findEditors(URI.parse('my://resource-findEditors-primary'));
        assert.strictEqual(foundEditors.length, 0);
        foundEditors = service.findEditors(URI.parse('my://resource-findEditors-primary'), { supportSideBySide: SideBySideEditor.PRIMARY });
        assert.strictEqual(foundEditors.length, 1);
        foundEditors = service.findEditors(URI.parse('my://resource-findEditors-secondary'), { supportSideBySide: SideBySideEditor.PRIMARY });
        assert.strictEqual(foundEditors.length, 0);
        foundEditors = service.findEditors(URI.parse('my://resource-findEditors-primary'), { supportSideBySide: SideBySideEditor.SECONDARY });
        assert.strictEqual(foundEditors.length, 0);
        foundEditors = service.findEditors(URI.parse('my://resource-findEditors-secondary'), { supportSideBySide: SideBySideEditor.SECONDARY });
        assert.strictEqual(foundEditors.length, 1);
        foundEditors = service.findEditors(URI.parse('my://resource-findEditors-primary'), { supportSideBySide: SideBySideEditor.ANY });
        assert.strictEqual(foundEditors.length, 1);
        foundEditors = service.findEditors(URI.parse('my://resource-findEditors-secondary'), { supportSideBySide: SideBySideEditor.ANY });
        assert.strictEqual(foundEditors.length, 1);
    });
    test('side by side editor is not matching all other editors (https://github.com/microsoft/vscode/issues/132859)', async () => {
        const [part, service] = await createEditorService();
        const rootGroup = part.activeGroup;
        const input = createTestFileEditorInput(URI.parse('my://resource-openEditors'), TEST_EDITOR_INPUT_ID);
        const otherInput = createTestFileEditorInput(URI.parse('my://resource2-openEditors'), TEST_EDITOR_INPUT_ID);
        const sideBySideInput = new SideBySideEditorInput(undefined, undefined, input, input, service);
        const otherSideBySideInput = new SideBySideEditorInput(undefined, undefined, otherInput, otherInput, service);
        await service.openEditor(sideBySideInput, undefined, SIDE_GROUP);
        part.activateGroup(rootGroup);
        await service.openEditor(otherSideBySideInput, { revealIfOpened: true, revealIfVisible: true });
        assert.strictEqual(rootGroup.count, 1);
    });
    test('onDidCloseEditor indicates proper context when moving editor across groups', async () => {
        const [part, service] = await createEditorService();
        const rootGroup = part.activeGroup;
        const input1 = createTestFileEditorInput(URI.parse('my://resource-onDidCloseEditor1'), TEST_EDITOR_INPUT_ID);
        const input2 = createTestFileEditorInput(URI.parse('my://resource-onDidCloseEditor2'), TEST_EDITOR_INPUT_ID);
        await service.openEditor(input1, { pinned: true });
        await service.openEditor(input2, { pinned: true });
        const sidegroup = part.addGroup(rootGroup, 3 /* GroupDirection.RIGHT */);
        const events = [];
        disposables.add(service.onDidCloseEditor(e => {
            events.push(e);
        }));
        rootGroup.moveEditor(input1, sidegroup);
        assert.strictEqual(events[0].context, EditorCloseContext.MOVE);
        await sidegroup.closeEditor(input1);
        assert.strictEqual(events[1].context, EditorCloseContext.UNKNOWN);
    });
    test('onDidCloseEditor indicates proper context when replacing an editor', async () => {
        const [part, service] = await createEditorService();
        const rootGroup = part.activeGroup;
        const input1 = createTestFileEditorInput(URI.parse('my://resource-onDidCloseEditor1'), TEST_EDITOR_INPUT_ID);
        const input2 = createTestFileEditorInput(URI.parse('my://resource-onDidCloseEditor2'), TEST_EDITOR_INPUT_ID);
        await service.openEditor(input1, { pinned: true });
        const events = [];
        disposables.add(service.onDidCloseEditor(e => {
            events.push(e);
        }));
        await rootGroup.replaceEditors([{ editor: input1, replacement: input2 }]);
        assert.strictEqual(events[0].context, EditorCloseContext.REPLACE);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yU2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci90ZXN0L2Jyb3dzZXIvZWRpdG9yU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZ0JBQWdCLEVBQXdCLE1BQU0saURBQWlELENBQUM7QUFDekcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsa0JBQWtCLEVBQWtHLHdCQUF3QixFQUF5RCxnQkFBZ0IsRUFBRSxhQUFhLEVBQTJCLE1BQU0sOEJBQThCLENBQUM7QUFDelUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLG1CQUFtQixFQUFFLGtCQUFrQixFQUFFLG1CQUFtQixFQUE2QiwwQkFBMEIsRUFBRSw0QkFBNEIsRUFBRSxnQkFBZ0IsRUFBRSxzQkFBc0IsRUFBRSxrQkFBa0IsRUFBRSw4QkFBOEIsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RXLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMvRCxPQUFPLEVBQWdCLG9CQUFvQixFQUFxQyxNQUFNLHFDQUFxQyxDQUFDO0FBRTVILE9BQU8sRUFBRSxZQUFZLEVBQW1DLGNBQWMsRUFBa0IsVUFBVSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDMUksT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMvRixPQUFPLEVBQUUsT0FBTyxF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T0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMxSCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxRQUFRLEVBQUUsVUFBVSxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsVUFBVSxDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsVUFBVSxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFeEksTUFBTSxPQUFPLEdBQUcsTUFBTSxPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2xELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN2RCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDekgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUUsUUFBUSxFQUFFLFVBQVUsQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLFVBQVUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRXhJLE1BQU0sT0FBTyxFQUFFLEtBQUssQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDeEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU5QyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbkQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMxSCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxRQUFRLEVBQUUsVUFBVSxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsVUFBVSxDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsVUFBVSxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFeEksTUFBTSxPQUFPLEVBQUUsS0FBSyxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUVsRCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbkQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3hELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FB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QUMsQ0FBQztRQUUxQyxNQUFNLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztRQUN4QixNQUFNLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztRQUMxQixNQUFNLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztRQUUzQixNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNwQixNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNwQixVQUFVLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUV4QixNQUFNLElBQUksR0FBRyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsU0FBUyxDQUFDLEVBQUUsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUM3RixNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUU1QyxNQUFNLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztRQUN4QixNQUFNLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztRQUMxQixNQUFNLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztRQUUzQixNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNwQixNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNwQixVQUFVLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUV4QixNQUFNLFNBQVMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUM1QyxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNwQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFN0MsTUFBTSxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFDeEIsTUFBTSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7UUFDMUIsTUFBTSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7UUFFM0IsTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7UUFDcEIsTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7UUFDcEIsVUFBVSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7UUFFeEIsTUFBTSxJQUFJLEdBQUcsTUFBTSxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDckMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3ZDLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUUxQyxNQUFNLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztRQUN4QixNQUFNLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztRQUMxQixNQUFNLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztRQUMzQixNQUFNLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztRQUN4QixNQUFNLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztRQUMxQixNQUFNLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztRQUUzQixNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNwQixNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNwQixVQUFVLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUV4QixNQUFNLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUV4QyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDNUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTVDLHdDQUF3QztRQUN4QyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNuRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLO1FBQy9DLE1BQU0sQ0FBQyxFQUFFLE9BQU8sQ0FBQyxHQUFHLE1BQU0sbUJBQW1CLEVBQUUsQ0FBQztRQUVoRCxNQUFNLE1BQU0sR0FBRyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUM1RixNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNwQixNQUFNLE1BQU0sR0FBRyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUM1RixNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNwQixNQUFNLFVBQVUsR0FBRyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUNoRyxVQUFVLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUV4QixNQUFNLE9BQU8sQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUNqRSxNQUFNLE9BQU8sQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDbkQsTUFBTSxPQUFPLENBQUMsVUFBVSxDQUFDLFVBQVUsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUVuRSxNQUFNLFNBQVMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUNuRSxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNwQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRWpELE1BQU0sQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLE1BQU0sQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO1FBQzFCLE1BQU0sQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1FBRTNCLFVBQVUsQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO1FBQzVCLFVBQVUsQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO1FBQzlCLFVBQVUsQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1FBRS9CLE1BQU0sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1FBQ3BCLE1BQU0sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1FBQ3BCLFVBQVUsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1FBRXhCLE1BQU0sT0FBTyxHQUFHLE1BQU0sT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQy9ELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxQyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQy9DLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdEQUFnRCxFQUFFLEtBQUs7UUFDM0QsTUFBTSxzQkFBc0IsQ0FBQyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9DLE1BQU0sc0JBQXNCLENBQUMsRUFBRSxlQUFlLEVBQUUsS0FBSyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3hFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdEQUFnRCxFQUFFLEtBQUs7UUFDM0QsTUFBTSxzQkFBc0IsQ0FBQyxFQUFFLGVBQWUsRUFBRSxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDckUsTUFBTSxzQkFBc0IsQ0FBQyxFQUFFLGVBQWUsRUFBRSxFQUFFLGlCQUFpQixFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzlGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGtEQUFrRCxFQUFFLEtBQUs7UUFDN0QsTUFBTSxzQkFBc0IsQ0FBQyxFQUFFLGVBQWUsRUFBRSxFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzVGLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxVQUFVLHNCQUFzQixDQUFDLE9BQXdDLEVBQUUsY0FBdUIsRUFBRSxnQkFBeUI7UUFDakksTUFBTSxDQUFDLEVBQUUsT0FBTyxDQUFDLEdBQUcsTUFBTSxtQkFBbUIsRUFBRSxDQUFDO1FBQ2hELE1BQU0sTUFBTSxHQUFHLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQzVGLE1BQU0sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1FBQ3BCLE1BQU0sYUFBYSxHQUFHLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQ25HLGFBQWEsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1FBQzNCLGFBQWEsQ0FBQyxZQUFZLDJDQUFtQyxDQUFDO1FBQzlELE1BQU0sZUFBZSxHQUFHLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3JHLGVBQWUsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO1FBQ2hDLGVBQWUsQ0FBQyxZQUFZLEdBQUcsdUZBQXFFLENBQUM7UUFFckcsTUFBTSxPQUFPLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDakUsTUFBTSxPQUFPLENBQUMsVUFBVSxDQUFDLGFBQWEsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzFELE1BQU0sT0FBTyxDQUFDLFVBQVUsQ0FBQyxlQUFlLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUU1RCxNQUFNLFNBQVMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDbkQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDcEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLFdBQVcsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUM5RCxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxXQUFXLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUVsRSxNQUFNLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztRQUN4QixhQUFhLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztRQUNqQyxlQUFlLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztRQUVwQyxNQUFNLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztRQUN4QixhQUFhLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztRQUNqQyxlQUFlLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztRQUVwQyxNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNwQixhQUFhLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUMzQixlQUFlLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztRQUVoQyxNQUFNLE9BQU8sR0FBRyxNQUFNLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFGLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxQyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDM0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLGdCQUFnQixDQUFDLENBQUM7SUFDaEUsQ0FBQztJQUVELElBQUksQ0FBQywyQkFBMkIsRUFBRSxLQUFLO1FBQ3RDLE9BQU8seUJBQXlCLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDekMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsdUNBQXVDLEVBQUU7UUFDN0MsT0FBTyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN4QyxDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssVUFBVSx5QkFBeUIsQ0FBQyxLQUFjO1FBQ3RELE1BQU0sQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQyxHQUFHLE1BQU0sbUJBQW1CLEVBQUUsQ0FBQztRQUU5RCxNQUFNLE1BQU0sR0FBRyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUM1RixNQUFNLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNyQixNQUFNLE1BQU0sR0FBRyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUM1RixNQUFNLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUVyQixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO1FBRW5DLE1BQU0sT0FBTyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUNuRCxNQUFNLE9BQU8sQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFFbkQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRW5ELE1BQU0seUJBQXlCLEdBQUcsdUJBQXVCLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDbkUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxRQUFRLCtCQUF1QixDQUFDLENBQUM7UUFDdkcsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osTUFBTSx5QkFBeUIsQ0FBQztRQUNqQyxDQUFDO1FBRUQsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLFlBQVksRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNwRCxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLFlBQVksRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNwRCxDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksQ0FBQyw4QkFBOEIsRUFBRSxLQUFLO1FBQ3pDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQyxHQUFHLE1BQU0sbUJBQW1CLEVBQUUsQ0FBQztRQUU5RCxNQUFNLE1BQU0sR0FBRyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUM1RixNQUFNLFVBQVUsR0FBRyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUNoRyxNQUFNLENBQUMsV0FBVyxHQUFHLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxDQUFDO1FBRTVDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFFbkMsTUFBTSxPQUFPLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRW5ELE1BQU0seUJBQXlCLEdBQUcsdUJBQXVCLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDbkUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxRQUFRLDhCQUFzQjtZQUNuRyxRQUFRLEVBQUUsVUFBVSxDQUFDLFFBQVE7WUFDN0IsS0FBSyxFQUFFLENBQUM7WUFDUixJQUFJLEVBQUUsRUFBRTtZQUNSLFdBQVcsRUFBRSxLQUFLO1lBQ2xCLE1BQU0sRUFBRSxJQUFJO1lBQ1osS0FBSyxFQUFFLENBQUM7WUFDUixJQUFJLEVBQUUsV0FBVztZQUNqQixJQUFJLEVBQUUsQ0FBQztZQUNQLGNBQWMsRUFBRSxLQUFLO1lBQ3JCLFFBQVEsRUFBRSxLQUFLO1lBQ2YsTUFBTSxFQUFFLEtBQUs7WUFDYixVQUFVLEVBQUUsS0FBSztZQUNqQixRQUFRLEVBQUUsU0FBUztTQUNuQixDQUFDLENBQUMsQ0FBQztRQUNKLE1BQU0seUJBQXlCLENBQUM7UUFFaEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsWUFBWSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ3hELENBQUMsQ0FBQyxDQUFDO0lBRUgsU0FBUyx1QkFBdUIsQ0FBQyxhQUE2QjtRQUM3RCxPQUFPLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO0lBQzNFLENBQUM7SUFFRCxJQUFJLENBQUMsd0RBQXdELEVBQUUsS0FBSztRQUNuRSxNQUFNLENBQUMsRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLEdBQUcsTUFBTSxtQkFBbUIsRUFBRSxDQUFDO1FBRTFELE1BQU0sTUFBTSxHQUFHLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQzlGLE1BQU0sTUFBTSxHQUFHLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRTlGLE1BQU0sT0FBTyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUNuRCxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzRCxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUUzRixNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDbEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFFM0YsTUFBTSxNQUFNLEVBQUUsS0FBSyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ3RDLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzVELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDBDQUEwQyxFQUFFLEtBQUs7UUFDckQsTUFBTSxvQkFBb0IsR0FBRyw2QkFBNkIsQ0FBQyxFQUFFLGlCQUFpQixFQUFFLG9CQUFvQixDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsNkJBQTZCLENBQUMsRUFBRSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQzNMLE1BQU0sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLEdBQUcsTUFBTSxtQkFBbUIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBRXhFLE1BQU0sTUFBTSxHQUFHLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQzlGLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRS9FLE1BQU0sT0FBTyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUVuRCxNQUFNLHVCQUF1QixHQUFHLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSx1QkFBdUIsQ0FBQztRQUNsRixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sQ0FBQyxXQUFXLENBQUMsdUJBQXVCLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO0lBQ3pHLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEtBQUs7UUFDL0MsTUFBTSxDQUFDLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQyxHQUFHLE1BQU0sbUJBQW1CLEVBQUUsQ0FBQztRQUMxRCxNQUFNLHFCQUFxQixHQUFHLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQztRQUM3RCxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQztRQUVyRCxJQUFJLFdBQVcsR0FBRyxDQUFDLENBQUM7UUFFcEIsTUFBTSxzQkFBc0IsR0FBRyxxQkFBcUIsQ0FBQyxjQUFjLENBQ2xFLE1BQU0sRUFDTjtZQUNDLEVBQUUsRUFBRSxZQUFZO1lBQ2hCLEtBQUssRUFBRSxhQUFhO1lBQ3BCLE1BQU0sRUFBRSxzQkFBc0I7WUFDOUIsUUFBUSxFQUFFLHdCQUF3QixDQUFDLE9BQU87U0FDMUMsRUFDRCxFQUFFLEVBQ0Y7WUFDQyxpQkFBaUIsRUFBRSxDQUFDLFdBQVcsRUFBRSxFQUFFO2dCQUNsQyxXQUFXLEVBQUUsQ0FBQztnQkFDZCxPQUFPLENBQUMsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3RFLENBQUM7WUFDRCxxQkFBcUIsRUFBRSxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztTQUNqRyxDQUNELENBQUM7UUFDRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVuQyxNQUFNLE1BQU0sR0FBRyxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxDQUFDLEVBQUUsQ0FBQztRQUN6RSxNQUFNLE1BQU0sR0FBRyxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLCtCQUErQixDQUFDLEVBQUUsQ0FBQztRQUV4RSxpRkFBaUY7UUFDakYsTUFBTSxPQUFPLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRW5DLDZFQUE2RTtRQUM3RSxNQUFNLE9BQU8sQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFbkMsa0ZBQWtGO1FBQ2xGLE1BQU0sT0FBTyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsTUFBTSxFQUFFLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDMUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFbkMsc0JBQXNCLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbEMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMscUNBQXFDLEVBQUUsS0FBSztRQUNoRCxNQUFNLENBQUMsRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLEdBQUcsTUFBTSxtQkFBbUIsRUFBRSxDQUFDO1FBQzFELE1BQU0scUJBQXFCLEdBQUcsUUFBUSxDQUFDLHFCQUFxQixDQUFDO1FBQzdELE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLGlCQUFpQixDQUFDO1FBRXJELElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztRQUVwQixNQUFNLHNCQUFzQixHQUFHLHFCQUFxQixDQUFDLGNBQWMsQ0FDbEUsTUFBTSxFQUNOO1lBQ0MsRUFBRSxFQUFFLFlBQVk7WUFDaEIsS0FBSyxFQUFFLGFBQWE7WUFDcEIsTUFBTSxFQUFFLHNCQUFzQjtZQUM5QixRQUFRLEVBQUUsd0JBQXdCLENBQUMsT0FBTztTQUMxQyxFQUNELEVBQUUsRUFDRjtZQUNDLGlCQUFpQixFQUFFLENBQUMsV0FBVyxFQUFFLEVBQUU7Z0JBQ2xDLFdBQVcsRUFBRSxDQUFDO2dCQUNkLE9BQU8sQ0FBQyxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdEUsQ0FBQztZQUNELHFCQUFxQixFQUFFLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1NBQ2pHLENBQ0QsQ0FBQztRQUNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRW5DLE1BQU0sTUFBTSxHQUFHLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0NBQWdDLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ3hILE1BQU0sTUFBTSxHQUFHLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0NBQWdDLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ3hILE1BQU0sTUFBTSxHQUFHLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsK0JBQStCLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ3ZILE1BQU0sTUFBTSxHQUFHLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsK0JBQStCLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBRXZILE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbEIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsQixNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xCLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFbEIscUJBQXFCO1FBQ3JCLE1BQU0sT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDNUQsb0NBQW9DO1FBQ3BDLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRW5DLHNCQUFzQixDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2xDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdDQUF3QyxFQUFFLEtBQUs7UUFDbkQsTUFBTSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLEdBQUcsTUFBTSxtQkFBbUIsRUFBRSxDQUFDO1FBQzlELE1BQU0scUJBQXFCLEdBQUcsUUFBUSxDQUFDLHFCQUFxQixDQUFDO1FBQzdELE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLGlCQUFpQixDQUFDO1FBRXJELElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztRQUVwQixNQUFNLHNCQUFzQixHQUFHLHFCQUFxQixDQUFDLGNBQWMsQ0FDbEUsTUFBTSxFQUNOO1lBQ0MsRUFBRSxFQUFFLFlBQVk7WUFDaEIsS0FBSyxFQUFFLGFBQWE7WUFDcEIsTUFBTSxFQUFFLHNCQUFzQjtZQUM5QixRQUFRLEVBQUUsd0JBQXdCLENBQUMsT0FBTztTQUMxQyxFQUNELEVBQUUsRUFDRjtZQUNDLGlCQUFpQixFQUFFLENBQUMsV0FBVyxFQUFFLEVBQUU7Z0JBQ2xDLFdBQVcsRUFBRSxDQUFDO2dCQUNkLE9BQU8sQ0FBQyxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdEUsQ0FBQztZQUNELHFCQUFxQixFQUFFLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1NBQ2pHLENBQ0QsQ0FBQztRQUVGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRW5DLE1BQU0sTUFBTSxHQUFHLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsK0JBQStCLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQzNHLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUN6QyxNQUFNLENBQUMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRXpCLHFGQUFxRjtRQUNyRixNQUFNLE9BQU8sQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFbkMsTUFBTSxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBQzdCLE1BQU0sRUFBRSxNQUFNO2dCQUNkLFdBQVcsRUFBRSxhQUFhO2FBQzFCLENBQUMsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDdEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFbkMsc0JBQXNCLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbEMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsYUFBYSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzlCLE1BQU0sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLEdBQUcsTUFBTSxtQkFBbUIsRUFBRSxDQUFDO1FBRXBELE1BQU0sS0FBSyxHQUFHLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsMkJBQTJCLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3RHLE1BQU0sVUFBVSxHQUFHLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsNEJBQTRCLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRTVHLGVBQWU7UUFDZixNQUFNLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU5QyxlQUFlO1FBQ2YsTUFBTSxPQUFPLENBQUMsV0FBVyxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzNFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFOUMsTUFBTSxPQUFPLENBQUMsV0FBVyxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzNFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFOUMsTUFBTSxPQUFPLENBQUMsV0FBVyxDQUFDLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2hGLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFOUMsTUFBTSxPQUFPLENBQUMsV0FBVyxDQUFDLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUNoRSxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQy9DLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGNBQWMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMvQixNQUFNLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxHQUFHLE1BQU0sbUJBQW1CLEVBQUUsQ0FBQztRQUVwRCxNQUFNLEtBQUssR0FBRyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLDJCQUEyQixDQUFDLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUN0RyxNQUFNLFVBQVUsR0FBRyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLDRCQUE0QixDQUFDLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUU1RyxlQUFlO1FBQ2YsTUFBTSxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFOUMsZ0JBQWdCO1FBQ2hCLE1BQU0sT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BJLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDL0MsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsd0JBQXdCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDekMsTUFBTSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsR0FBRyxNQUFNLG1CQUFtQixFQUFFLENBQUM7UUFFcEQsTUFBTSxLQUFLLEdBQUcseUJBQXlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFDdEcsTUFBTSxVQUFVLEdBQUcseUJBQXlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFFNUcsZUFBZTtRQUNmLE1BQU0sT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN2RSxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTlDLDRDQUE0QztRQUM1QyxDQUFDO1lBQ0EsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDaEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBRXJDLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDdkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbkMsQ0FBQztRQUNELENBQUM7WUFDQSxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNyRixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFFMUMsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUMsQ0FBQztRQUN4QyxDQUFDO1FBRUQsNkNBQTZDO1FBQzdDLENBQUM7WUFDQSxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsdUJBQXVCLENBQUMsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ3BHLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUVyQyxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsdUJBQXVCLENBQUMsRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxvQkFBb0IsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDOUosTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdkMsQ0FBQztRQUVELGdEQUFnRDtRQUNoRCxDQUFDO1lBQ0EsTUFBTSxTQUFTLEdBQUcsTUFBTSxPQUFPLENBQUMsVUFBVSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsMkJBQTJCLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFFdkwsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxTQUFVLENBQUMsS0FBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3BGLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUVyQyxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsU0FBVSxDQUFDLEtBQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMzRSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN2QyxDQUFDO1FBRUQsaURBQWlEO1FBQ2pELE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUN6QyxDQUFDO1lBQ0EsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDaEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRXJDLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDdkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdkMsQ0FBQztJQUNGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDZCQUE2QixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzlDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLEdBQUcsTUFBTSxtQkFBbUIsRUFBRSxDQUFDO1FBRXBELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFFbkMsTUFBTSxLQUFLLEdBQUcseUJBQXlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFDdEcsTUFBTSxVQUFVLEdBQUcseUJBQXlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFFNUcsZUFBZTtRQUNmLE1BQU0sT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN2RSxNQUFNLFVBQVUsR0FBRyxNQUFNLE9BQU8sQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRWpGLDRDQUE0QztRQUM1QyxDQUFDO1lBQ0EsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDbkQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM1QyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDNUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUVwRCxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDNUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDNUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDckQsQ0FBQztRQUNELENBQUM7WUFDQSxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN4RCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1lBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFcEQsTUFBTSxNQUFNLEdB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QUFDO1FBRTNDLFlBQVksR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMscUNBQXFDLENBQUMsRUFBRSxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDdEksTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTNDLFlBQVksR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsbUNBQW1DLENBQUMsRUFBRSxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDdEksTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTNDLFlBQVksR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMscUNBQXFDLENBQUMsRUFBRSxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDeEksTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTNDLFlBQVksR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsbUNBQW1DLENBQUMsRUFBRSxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDaEksTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTNDLFlBQVksR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMscUNBQXFDLENBQUMsRUFBRSxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDbEksTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsTUFBTSxF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