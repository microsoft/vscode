/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { workbenchInstantiationService, registerTestEditor, TestFileEditorInput, createEditorParts } from '../../../../test/browser/workbenchTestServices.js';
import { IEditorGroupsService } from '../../common/editorGroupsService.js';
import { EditorExtensions } from '../../../../common/editor.js';
import { URI } from '../../../../../base/common/uri.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IEditorService, MODAL_GROUP } from '../../common/editorService.js';
import { findGroup } from '../../common/editorGroupFinder.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { EditorService } from '../../browser/editorService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { Memento } from '../../../../common/memento.js';
suite('Modal Editor Group', () => {
    const TEST_EDITOR_ID = 'MyFileEditorForModalEditorGroup';
    const TEST_EDITOR_INPUT_ID = 'testEditorInputForModalEditorGroup';
    const disposables = new DisposableStore();
    setup(() => {
        disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(SideBySideEditorInput)], TEST_EDITOR_INPUT_ID));
    });
    teardown(() => {
        disposables.clear();
    });
    function createTestFileEditorInput(resource, typeId) {
        return disposables.add(new TestFileEditorInput(resource, typeId));
    }
    test('MODAL_GROUP constant is defined correctly', () => {
        assert.strictEqual(MODAL_GROUP, -4);
        assert.strictEqual(typeof MODAL_GROUP, 'number');
    });
    test('MODAL_GROUP_TYPE type exists', () => {
        const modalGroupValue = MODAL_GROUP;
        assert.strictEqual(modalGroupValue, -4);
    });
    test('createModalEditorPart creates a modal editor part', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        assert.ok(modalPart);
        assert.ok(modalPart.activeGroup);
        assert.strictEqual(typeof modalPart.close, 'function');
        await modalPart.close();
    });
    test('modal editor part has correct initial state', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        // Modal part should have exactly one group initially with 0 editors
        assert.strictEqual(modalPart.activeGroup.count, 0);
        await modalPart.close();
    });
    test('modal editor part can open editors', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
        await modalPart.activeGroup.openEditor(input, { pinned: true });
        assert.strictEqual(modalPart.activeGroup.count, 1);
        assert.strictEqual(modalPart.activeGroup.activeEditor, input);
        await modalPart.close();
    });
    test('modal editor part is added to parts list', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const initialGroupCount = parts.groups.length;
        const modalPart = await parts.createModalEditorPart();
        // Modal part's group should be added to the total groups
        assert.strictEqual(parts.groups.length, initialGroupCount + 1);
        await modalPart.close();
    });
    test('closing modal part fires onWillClose event', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        // Verify onWillClose is an event that can be listened to
        assert.ok(typeof modalPart.onWillClose === 'function');
        assert.ok(modalPart.onWillClose !== undefined);
        const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
        await modalPart.activeGroup.openEditor(input, { pinned: true });
        // Verify close returns true
        const result = await modalPart.close();
        assert.strictEqual(result, true);
    });
    test('modal editor part close returns true when no confirming editors', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
        await modalPart.activeGroup.openEditor(input, { pinned: true });
        const result = await modalPart.close();
        assert.strictEqual(result, true);
    });
    test('modal editor part getGroups returns groups in correct order', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
        await modalPart.activeGroup.openEditor(input, { pinned: true });
        // Modal part group should be in the groups list
        const allGroups = parts.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */);
        const modalGroup = modalPart.activeGroup;
        assert.ok(allGroups.some(g => g.id === modalGroup.id));
        await modalPart.close();
    });
    test('modal editor part is singleton - subsequent calls return same instance', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart1 = await parts.createModalEditorPart();
        const modalPart2 = await parts.createModalEditorPart();
        // Same instance should be returned
        assert.ok(modalPart1);
        assert.ok(modalPart2);
        assert.strictEqual(modalPart1, modalPart2);
        assert.strictEqual(modalPart1.activeGroup.id, modalPart2.activeGroup.id);
        await modalPart1.close();
    });
    test('modal editor part singleton is reset after close', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        // Create first modal
        const modalPart1 = await parts.createModalEditorPart();
        const firstGroupId = modalPart1.activeGroup.id;
        // Close it
        await modalPart1.close();
        // Create another modal - should be a new instance
        const modalPart2 = await parts.createModalEditorPart();
        // Should be a different group
        assert.notStrictEqual(modalPart2.activeGroup.id, firstGroupId);
        await modalPart2.close();
    });
    test('modal editor part onDidAddGroup fires only once for singleton', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        let addGroupCount = 0;
        disposables.add(parts.onDidAddGroup(() => {
            addGroupCount++;
        }));
        // Create modal twice
        await parts.createModalEditorPart();
        await parts.createModalEditorPart();
        // onDidAddGroup should fire only once since it's a singleton
        assert.strictEqual(addGroupCount, 1);
        await (await parts.createModalEditorPart()).close();
    });
    test('modal editor part enforces no tabs mode', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        // Modal parts should enforce no tabs mode
        assert.strictEqual(modalPart.partOptions.showTabs, 'none');
        await modalPart.close();
    });
    test('modal editor part enforces closeEmptyGroups', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        // Modal parts should enforce closeEmptyGroups
        assert.strictEqual(modalPart.partOptions.closeEmptyGroups, true);
        await modalPart.close();
    });
    test('closing all editors in modal removes the modal group', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
        await modalPart.activeGroup.openEditor(input, { pinned: true });
        const modalGroupId = modalPart.activeGroup.id;
        // The modal group should exist in parts
        assert.ok(parts.getGroup(modalGroupId));
        // Closing the last editor in the last group should close the modal
        // which removes the group from parts
        await modalPart.activeGroup.closeAllEditors();
        // The modal group should no longer exist in parts
        assert.strictEqual(parts.getGroup(modalGroupId), undefined);
    });
    test('modal editor part does not persist state', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
        await modalPart.activeGroup.openEditor(input, { pinned: true });
        // Modal part should have saveState as a no-op (we can't directly test this,
        // but we verify the modal was created successfully which means state handling works)
        assert.ok(modalPart.activeGroup);
        await modalPart.close();
    });
    test('activePart returns modal when focused', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
        await modalPart.activeGroup.openEditor(input, { pinned: true });
        // Focus the modal group
        modalPart.activeGroup.focus();
        // The modal group should be included in the groups
        const groups = parts.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */);
        assert.ok(groups.some(g => g.id === modalPart.activeGroup.id));
        await modalPart.close();
    });
    test('modal part group can be found by id', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        const modalGroup = modalPart.activeGroup;
        const foundGroup = parts.getGroup(modalGroup.id);
        assert.ok(foundGroup);
        assert.strictEqual(foundGroup.id, modalGroup.id);
        await modalPart.close();
    });
    test('onDidAddGroup fires when modal is created', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        let addedGroupId;
        disposables.add(parts.onDidAddGroup(group => {
            addedGroupId = group.id;
        }));
        const modalPart = await parts.createModalEditorPart();
        assert.ok(addedGroupId !== undefined);
        assert.strictEqual(addedGroupId, modalPart.activeGroup.id);
        await modalPart.close();
    });
    test('onDidRemoveGroup fires when modal is closed', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        const modalGroupId = modalPart.activeGroup.id;
        let removedGroupId;
        disposables.add(parts.onDidRemoveGroup(group => {
            removedGroupId = group.id;
        }));
        await modalPart.close();
        assert.ok(removedGroupId !== undefined);
        assert.strictEqual(removedGroupId, modalGroupId);
    });
    test('activeModalEditorPart is set when modal is created and cleared on close', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        // No modal initially
        assert.strictEqual(parts.activeModalEditorPart, undefined);
        // Create modal
        const modalPart = await parts.createModalEditorPart();
        assert.strictEqual(parts.activeModalEditorPart, modalPart);
        // Close modal
        await modalPart.close();
        assert.strictEqual(parts.activeModalEditorPart, undefined);
    });
    test('findGroup returns main part group when modal is active and preferredGroup is not MODAL_GROUP', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const mainGroup = parts.mainPart.activeGroup;
        // Create modal and open an editor in it
        const modalPart = await parts.createModalEditorPart();
        const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
        await modalPart.activeGroup.openEditor(input, { pinned: true });
        // findGroup without MODAL_GROUP should return main part group, not modal group
        const newInput = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
        const [group] = await instantiationService.invokeFunction(accessor => findGroup(accessor, { resource: newInput.resource }, undefined));
        assert.strictEqual(group.id, mainGroup.id);
    });
    test('findGroup closes modal when preferredGroup is not MODAL_GROUP and preserveFocus is not set', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        // Create modal
        const modalPart = await parts.createModalEditorPart();
        const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
        await modalPart.activeGroup.openEditor(input, { pinned: true });
        assert.ok(parts.activeModalEditorPart);
        // findGroup without MODAL_GROUP and without preserveFocus should close the modal
        const newInput = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
        await instantiationService.invokeFunction(accessor => findGroup(accessor, { resource: newInput.resource }, undefined));
        assert.strictEqual(parts.activeModalEditorPart, undefined);
    });
    test('findGroup keeps modal open when preserveFocus is true', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        // Create modal
        const modalPart = await parts.createModalEditorPart();
        const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
        await modalPart.activeGroup.openEditor(input, { pinned: true });
        assert.ok(parts.activeModalEditorPart);
        // findGroup with preserveFocus should keep the modal open
        const newInput = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
        await instantiationService.invokeFunction(accessor => findGroup(accessor, { resource: newInput.resource, options: { preserveFocus: true } }, undefined));
        assert.strictEqual(parts.activeModalEditorPart, modalPart);
        await modalPart.close();
    });
    test('modal editor part starts not maximized', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        assert.strictEqual(modalPart.maximized, false);
        await modalPart.close();
    });
    test('modal editor part toggleMaximized toggles state', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        assert.strictEqual(modalPart.maximized, false);
        modalPart.toggleMaximized();
        assert.strictEqual(modalPart.maximized, true);
        modalPart.toggleMaximized();
        assert.strictEqual(modalPart.maximized, false);
        await modalPart.close();
    });
    test('modal editor part fires onDidChangeMaximized', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const modalPart = await parts.createModalEditorPart();
        const events = [];
        disposables.add(modalPart.onDidChangeMaximized(maximized => events.push(maximized)));
        modalPart.toggleMaximized();
        modalPart.toggleMaximized();
        assert.deepStrictEqual(events, [true, false]);
        await modalPart.close();
    });
    test('modal editor part remembers maximized state across instances', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        // Open modal and maximize it
        const modalPart1 = await parts.createModalEditorPart();
        modalPart1.toggleMaximized();
        assert.strictEqual(modalPart1.maximized, true);
        await modalPart1.close();
        // Open a new modal - should remember maximized state
        const modalPart2 = await parts.createModalEditorPart();
        assert.strictEqual(modalPart2.maximized, true);
        await modalPart2.close();
        // Open another modal after un-maximizing
        const modalPart3 = await parts.createModalEditorPart();
        assert.strictEqual(modalPart3.maximized, true);
        modalPart3.toggleMaximized();
        assert.strictEqual(modalPart3.maximized, false);
        await modalPart3.close();
        // Should now remember non-maximized state
        const modalPart4 = await parts.createModalEditorPart();
        assert.strictEqual(modalPart4.maximized, false);
        await modalPart4.close();
    });
    suite('useModal: all', () => {
        test('findGroup creates modal and returns its active group', async () => {
            const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
            instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
            const configurationService = new TestConfigurationService();
            await configurationService.setUserConfiguration('workbench.editor.useModal', 'all');
            instantiationService.stub(IConfigurationService, configurationService);
            const parts = await createEditorParts(instantiationService, disposables);
            instantiationService.stub(IEditorGroupsService, parts);
            // findGroup with undefined preferredGroup should create modal and return its group
            const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
            const result = instantiationService.invokeFunction(accessor => findGroup(accessor, { resource: input.resource }, undefined));
            // Should return a promise (async modal creation)
            assert.ok(result instanceof Promise);
            const [group] = await result;
            // The group should be in the modal part
            assert.ok(parts.activeModalEditorPart);
            assert.strictEqual(group.id, parts.activeModalEditorPart.activeGroup.id);
            await parts.activeModalEditorPart.close();
        });
        test('findGroup does not auto-close modal', async () => {
            const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
            instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
            const configurationService = new TestConfigurationService();
            await configurationService.setUserConfiguration('workbench.editor.useModal', 'all');
            instantiationService.stub(IConfigurationService, configurationService);
            const parts = await createEditorParts(instantiationService, disposables);
            instantiationService.stub(IEditorGroupsService, parts);
            // Create modal first
            const modalPart = await parts.createModalEditorPart();
            const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
            await modalPart.activeGroup.openEditor(input, { pinned: true });
            // findGroup without MODAL_GROUP should NOT close the modal
            const newInput = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
            const result = instantiationService.invokeFunction(accessor => findGroup(accessor, { resource: newInput.resource }, undefined));
            // Since the setting is 'on', modal stays open
            const [group] = result instanceof Promise ? await result : result;
            assert.ok(parts.activeModalEditorPart);
            assert.strictEqual(group.id, modalPart.activeGroup.id);
            await modalPart.close();
        });
        test('findGroup auto-closes modal when setting is not all', async () => {
            const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
            instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
            const configurationService = new TestConfigurationService();
            await configurationService.setUserConfiguration('workbench.editor.useModal', 'off');
            instantiationService.stub(IConfigurationService, configurationService);
            const parts = await createEditorParts(instantiationService, disposables);
            instantiationService.stub(IEditorGroupsService, parts);
            // Create modal
            const modalPart = await parts.createModalEditorPart();
            const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
            await modalPart.activeGroup.openEditor(input, { pinned: true });
            assert.ok(parts.activeModalEditorPart);
            // findGroup without MODAL_GROUP should close the modal
            const newInput = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
            await instantiationService.invokeFunction(accessor => findGroup(accessor, { resource: newInput.resource }, undefined));
            assert.strictEqual(parts.activeModalEditorPart, undefined);
        });
        test('shows tabs when multiple editors are open', async () => {
            const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
            instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
            const configurationService = new TestConfigurationService();
            await configurationService.setUserConfiguration('workbench.editor.useModal', 'all');
            instantiationService.stub(IConfigurationService, configurationService);
            const parts = await createEditorParts(instantiationService, disposables);
            instantiationService.stub(IEditorGroupsService, parts);
            const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
            instantiationService.stub(IEditorService, editorService);
            const input1 = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
            await editorService.openEditor(input1, { pinned: true }, MODAL_GROUP);
            const modalPart = parts.activeModalEditorPart;
            assert.ok(modalPart);
            // With 1 editor, tabs should be hidden
            assert.strictEqual(modalPart.partOptions.showTabs, 'none');
            // Open a second editor
            const input2 = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
            await editorService.openEditor(input2, { pinned: true }, MODAL_GROUP);
            // With 2 editors, tabs should be visible
            assert.strictEqual(modalPart.partOptions.showTabs, 'multiple');
            await modalPart.close();
        });
        test('hides tabs when not in all mode even with multiple editors', async () => {
            const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
            instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
            const configurationService = new TestConfigurationService();
            await configurationService.setUserConfiguration('workbench.editor.useModal', 'some');
            instantiationService.stub(IConfigurationService, configurationService);
            const parts = await createEditorParts(instantiationService, disposables);
            instantiationService.stub(IEditorGroupsService, parts);
            const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
            instantiationService.stub(IEditorService, editorService);
            const input1 = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
            await editorService.openEditor(input1, { pinned: true }, MODAL_GROUP);
            const modalPart = parts.activeModalEditorPart;
            assert.ok(modalPart);
            const input2 = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
            await editorService.openEditor(input2, { pinned: true }, MODAL_GROUP);
            // With 'some' mode, tabs should remain hidden even with multiple editors
            assert.strictEqual(modalPart.partOptions.showTabs, 'none');
            await modalPart.close();
        });
    });
    test('modal editor part editors can be moved to another group', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        // Create modal and open editors
        const modalPart = await parts.createModalEditorPart();
        const input1 = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
        const input2 = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
        await modalPart.activeGroup.openEditor(input1, { pinned: true });
        await modalPart.activeGroup.openEditor(input2, { pinned: true });
        assert.strictEqual(modalPart.activeGroup.count, 2);
        // Move editors from modal to main part group
        const targetGroup = parts.mainPart.activeGroup;
        for (const group of modalPart.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */)) {
            group.moveEditors(group.editors.map(editor => ({ editor, options: { preserveFocus: true } })), targetGroup);
        }
        // Editors should be in the target group now
        assert.strictEqual(targetGroup.count, 2);
        assert.strictEqual(modalPart.activeGroup.count, 0);
        // Close modal
        await modalPart.close();
        assert.strictEqual(parts.activeModalEditorPart, undefined);
    });
    test('openEditor with MODAL_GROUP ignores preserveFocus', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
        instantiationService.stub(IEditorService, editorService);
        const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
        const pane = await editorService.openEditor(input, { pinned: true, preserveFocus: true }, MODAL_GROUP);
        assert.ok(pane);
        assert.strictEqual(pane.options?.preserveFocus, false);
        await parts.activeModalEditorPart?.close();
    });
    test('modal editor part state is remembered on close and reused on next open', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        // Create maximized modal and close it
        const modalPart1 = await parts.createModalEditorPart({ maximized: true });
        await modalPart1.close();
        // Create a new modal — it should restore maximized state
        const modalPart2 = await parts.createModalEditorPart();
        assert.strictEqual(modalPart2.maximized, true);
        await modalPart2.close();
    });
    test('modal editor part state restores from profile storage', async () => {
        const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
        instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
        const storageService = instantiationService.get(IStorageService);
        // Pre-populate storage with modal state and clear memento cache
        // so the next EditorParts instance reads fresh from storage
        storageService.store('memento/workbench.editorParts', JSON.stringify({
            'editorparts.modalState': {
                maximized: true,
                size: { width: 500, height: 400 },
                position: { left: 100, top: 50 }
            }
        }), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        Memento.clear(0 /* StorageScope.PROFILE */);
        const parts = await createEditorParts(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, parts);
        // Create modal — it should use state from storage
        const modalPart = await parts.createModalEditorPart();
        assert.strictEqual(modalPart.maximized, true);
        await modalPart.close();
    });
    suite('RequiresModal capability', () => {
        test('findGroup opens modal for editor with RequiresModal even when setting is off', async () => {
            const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
            instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
            const configurationService = new TestConfigurationService();
            await configurationService.setUserConfiguration('workbench.editor.useModal', 'off');
            instantiationService.stub(IConfigurationService, configurationService);
            const parts = await createEditorParts(instantiationService, disposables);
            instantiationService.stub(IEditorGroupsService, parts);
            const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
            input.capabilities = 2048 /* EditorInputCapabilities.RequiresModal */;
            const result = instantiationService.invokeFunction(accessor => findGroup(accessor, { editor: input, options: {} }, undefined));
            assert.ok(result instanceof Promise);
            const [group] = await result;
            assert.ok(parts.activeModalEditorPart);
            assert.strictEqual(group.id, parts.activeModalEditorPart.activeGroup.id);
            await parts.activeModalEditorPart.close();
        });
        test('findGroup does not close modal for RequiresModal editor when modal is already open', async () => {
            const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
            instantiationService.invokeFunction(accessor => Registry.as(EditorExtensions.EditorFactory).start(accessor));
            const configurationService = new TestConfigurationService();
            await configurationService.setUserConfiguration('workbench.editor.useModal', 'some');
            instantiationService.stub(IConfigurationService, configurationService);
            const parts = await createEditorParts(instantiationService, disposables);
            instantiationService.stub(IEditorGroupsService, parts);
            // Create a modal part first
            const modalPart = await parts.createModalEditorPart();
            const existingInput = createTestFileEditorInput(URI.file('foo/existing'), TEST_EDITOR_INPUT_ID);
            await modalPart.activeGroup.openEditor(existingInput, { pinned: true });
            // Now open a RequiresModal editor — modal should stay open
            const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
            input.capabilities = 2048 /* EditorInputCapabilities.RequiresModal */;
            const result = instantiationService.invokeFunction(accessor => findGroup(accessor, { editor: input, options: {} }, undefined));
            assert.ok(result instanceof Promise);
            const [group] = await result;
            assert.ok(parts.activeModalEditorPart);
            assert.strictEqual(parts.activeModalEditorPart, modalPart);
            assert.strictEqual(group.id, modalPart.activeGroup.id);
            await modalPart.close();
        });
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kYWxFZGl0b3JHcm91cC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci90ZXN0L2Jyb3dzZXIvbW9kYWxFZGl0b3JHcm91cC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsNkJBQTZCLEVBQUUsa0JBQWtCLEVBQUUsbUJBQW1CLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUM5SixPQUFPLEVBQWUsb0JBQW9CLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN4RixPQUFPLEVBQUUsZ0JBQWdCLEVBQW1ELE1BQU0sOEJBQThCLENBQUM7QUFDakgsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUM3RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDeEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDM0YsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFvQixNQUFNLCtCQUErQixDQUFDO0FBQzlGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUs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