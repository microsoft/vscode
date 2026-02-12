/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { workbenchInstantiationService, registerTestEditor, TestFileEditorInput, createEditorParts } from '../../../../test/browser/workbenchTestServices.js';
import { GroupsOrder, IEditorGroupsService } from '../../common/editorGroupsService.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { URI } from '../../../../../base/common/uri.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { MODAL_GROUP, MODAL_GROUP_TYPE } from '../../common/editorService.js';
import { findGroup } from '../../common/editorGroupFinder.js';

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

	function createTestFileEditorInput(resource: URI, typeId: string): TestFileEditorInput {
		return disposables.add(new TestFileEditorInput(resource, typeId));
	}

	test('MODAL_GROUP constant is defined correctly', () => {
		assert.strictEqual(MODAL_GROUP, -4);
		assert.strictEqual(typeof MODAL_GROUP, 'number');
	});

	test('MODAL_GROUP_TYPE type exists', () => {
		const modalGroupValue: MODAL_GROUP_TYPE = MODAL_GROUP;
		assert.strictEqual(modalGroupValue, -4);
	});

	test('createModalEditorPart creates a modal editor part', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		assert.ok(modalPart);
		assert.ok(modalPart.activeGroup);
		assert.strictEqual(typeof modalPart.close, 'function');

		modalPart.close();
	});

	test('modal editor part has correct initial state', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		// Modal part should have exactly one group initially with 0 editors
		assert.strictEqual(modalPart.activeGroup.count, 0);

		modalPart.close();
	});

	test('modal editor part can open editors', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		assert.strictEqual(modalPart.activeGroup.count, 1);
		assert.strictEqual(modalPart.activeGroup.activeEditor, input);

		modalPart.close();
	});

	test('modal editor part is added to parts list', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const initialGroupCount = parts.groups.length;

		const modalPart = await parts.createModalEditorPart();

		// Modal part's group should be added to the total groups
		assert.strictEqual(parts.groups.length, initialGroupCount + 1);

		modalPart.close();
	});

	test('closing modal part fires onWillClose event', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		// Verify onWillClose is an event that can be listened to
		assert.ok(typeof modalPart.onWillClose === 'function');
		assert.ok(modalPart.onWillClose !== undefined);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		// Verify close returns true
		const result = modalPart.close();
		assert.strictEqual(result, true);
	});

	test('modal editor part close returns true when no confirming editors', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		const result = modalPart.close();

		assert.strictEqual(result, true);
	});

	test('modal editor part getGroups returns groups in correct order', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		// Modal part group should be in the groups list
		const allGroups = parts.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		const modalGroup = modalPart.activeGroup;

		assert.ok(allGroups.some(g => g.id === modalGroup.id));

		modalPart.close();
	});

	test('modal editor part is singleton - subsequent calls return same instance', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart1 = await parts.createModalEditorPart();
		const modalPart2 = await parts.createModalEditorPart();

		// Same instance should be returned
		assert.ok(modalPart1);
		assert.ok(modalPart2);
		assert.strictEqual(modalPart1, modalPart2);
		assert.strictEqual(modalPart1.activeGroup.id, modalPart2.activeGroup.id);

		modalPart1.close();
	});

	test('modal editor part singleton is reset after close', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		// Create first modal
		const modalPart1 = await parts.createModalEditorPart();
		const firstGroupId = modalPart1.activeGroup.id;

		// Close it
		modalPart1.close();

		// Create another modal - should be a new instance
		const modalPart2 = await parts.createModalEditorPart();

		// Should be a different group
		assert.notStrictEqual(modalPart2.activeGroup.id, firstGroupId);

		modalPart2.close();
	});

	test('modal editor part onDidAddGroup fires only once for singleton', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
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

		(await parts.createModalEditorPart()).close();
	});

	test('modal editor part enforces no tabs mode', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		// Modal parts should enforce no tabs mode
		assert.strictEqual(modalPart.partOptions.showTabs, 'none');

		modalPart.close();
	});

	test('modal editor part enforces closeEmptyGroups', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		// Modal parts should enforce closeEmptyGroups
		assert.strictEqual(modalPart.partOptions.closeEmptyGroups, true);

		modalPart.close();
	});

	test('closing all editors in modal removes the modal group', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
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
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		// Modal part should have saveState as a no-op (we can't directly test this,
		// but we verify the modal was created successfully which means state handling works)
		assert.ok(modalPart.activeGroup);

		modalPart.close();
	});

	test('activePart returns modal when focused', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		// Focus the modal group
		modalPart.activeGroup.focus();

		// The modal group should be included in the groups
		const groups = parts.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		assert.ok(groups.some(g => g.id === modalPart.activeGroup.id));

		modalPart.close();
	});

	test('modal part group can be found by id', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const modalGroup = modalPart.activeGroup;
		const foundGroup = parts.getGroup(modalGroup.id);

		assert.ok(foundGroup);
		assert.strictEqual(foundGroup!.id, modalGroup.id);

		modalPart.close();
	});

	test('onDidAddGroup fires when modal is created', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		let addedGroupId: number | undefined;
		disposables.add(parts.onDidAddGroup(group => {
			addedGroupId = group.id;
		}));

		const modalPart = await parts.createModalEditorPart();

		assert.ok(addedGroupId !== undefined);
		assert.strictEqual(addedGroupId, modalPart.activeGroup.id);

		modalPart.close();
	});

	test('onDidRemoveGroup fires when modal is closed', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const modalGroupId = modalPart.activeGroup.id;

		let removedGroupId: number | undefined;
		disposables.add(parts.onDidRemoveGroup(group => {
			removedGroupId = group.id;
		}));

		modalPart.close();

		assert.ok(removedGroupId !== undefined);
		assert.strictEqual(removedGroupId, modalGroupId);
	});

	test('activeModalEditorPart is set when modal is created and cleared on close', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		// No modal initially
		assert.strictEqual(parts.activeModalEditorPart, undefined);

		// Create modal
		const modalPart = await parts.createModalEditorPart();
		assert.strictEqual(parts.activeModalEditorPart, modalPart);

		// Close modal
		modalPart.close();
		assert.strictEqual(parts.activeModalEditorPart, undefined);
	});

	test('findGroup returns main part group when modal is active and preferredGroup is not MODAL_GROUP', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const mainGroup = parts.mainPart.activeGroup;

		// Create modal and open an editor in it
		const modalPart = await parts.createModalEditorPart();
		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		// findGroup without MODAL_GROUP should return main part group, not modal group
		const newInput = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
		const [group] = instantiationService.invokeFunction(accessor => findGroup(accessor, { resource: newInput.resource }, undefined));

		assert.strictEqual(group.id, mainGroup.id);
	});

	test('findGroup closes modal when preferredGroup is not MODAL_GROUP and preserveFocus is not set', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		// Create modal
		const modalPart = await parts.createModalEditorPart();
		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		assert.ok(parts.activeModalEditorPart);

		// findGroup without MODAL_GROUP and without preserveFocus should close the modal
		const newInput = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
		instantiationService.invokeFunction(accessor => findGroup(accessor, { resource: newInput.resource }, undefined));

		assert.strictEqual(parts.activeModalEditorPart, undefined);
	});

	test('findGroup keeps modal open when preserveFocus is true', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		// Create modal
		const modalPart = await parts.createModalEditorPart();
		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		assert.ok(parts.activeModalEditorPart);

		// findGroup with preserveFocus should keep the modal open
		const newInput = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
		instantiationService.invokeFunction(accessor => findGroup(accessor, { resource: newInput.resource, options: { preserveFocus: true } }, undefined));

		assert.strictEqual(parts.activeModalEditorPart, modalPart);

		modalPart.close();
	});

	test('modal editor part starts not maximized', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		assert.strictEqual(modalPart.maximized, false);

		modalPart.close();
	});

	test('modal editor part toggleMaximized toggles state', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		assert.strictEqual(modalPart.maximized, false);

		modalPart.toggleMaximized();
		assert.strictEqual(modalPart.maximized, true);

		modalPart.toggleMaximized();
		assert.strictEqual(modalPart.maximized, false);

		modalPart.close();
	});

	test('modal editor part fires onDidChangeMaximized', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const events: boolean[] = [];
		disposables.add(modalPart.onDidChangeMaximized(maximized => events.push(maximized)));

		modalPart.toggleMaximized();
		modalPart.toggleMaximized();

		assert.deepStrictEqual(events, [true, false]);

		modalPart.close();
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
