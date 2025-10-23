/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { workbenchInstantiationService, registerTestEditor, TestFileEditorInput, TestEditorPart, TestServiceAccessor, ITestInstantiationService, workbenchTeardown, createEditorParts, TestEditorParts } from '../../../../test/browser/workbenchTestServices.js';
import { GroupDirection, GroupsOrder, MergeGroupMode, GroupOrientation, GroupLocation, isEditorGroup, IEditorGroupsService, GroupsArrangement, IEditorGroupContextKeyProvider } from '../../common/editorGroupsService.js';
import { CloseDirection, IEditorPartOptions, EditorsOrder, EditorInputCapabilities, GroupModelChangeKind, SideBySideEditor, IEditorFactoryRegistry, EditorExtensions } from '../../../../common/editor.js';
import { URI } from '../../../../../base/common/uri.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ConfirmResult } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { IGroupModelChangeEvent, IGroupEditorMoveEvent, IGroupEditorOpenEvent } from '../../../../common/editor/editorGroupModel.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { Emitter } from '../../../../../base/common/event.js';
import { isEqual } from '../../../../../base/common/resources.js';

suite('EditorGroupsService', () => {

	const TEST_EDITOR_ID = 'MyFileEditorForEditorGroupService';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForEditorGroupService';

	const disposables = new DisposableStore();

	let testLocalInstantiationService: ITestInstantiationService | undefined = undefined;

	setup(() => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(SideBySideEditorInput)], TEST_EDITOR_INPUT_ID));
	});

	teardown(async () => {
		if (testLocalInstantiationService) {
			await workbenchTeardown(testLocalInstantiationService);
			testLocalInstantiationService = undefined;
		}

		disposables.clear();
	});

	async function createParts(instantiationService = workbenchInstantiationService(undefined, disposables)): Promise<[TestEditorParts, TestInstantiationService]> {
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		testLocalInstantiationService = instantiationService;

		return [parts, instantiationService];
	}

	async function createPart(instantiationService?: TestInstantiationService): Promise<[TestEditorPart, TestInstantiationService]> {
		const [parts, testInstantiationService] = await createParts(instantiationService);
		return [parts.testMainPart, testInstantiationService];
	}

	function createTestFileEditorInput(resource: URI, typeId: string): TestFileEditorInput {
		return disposables.add(new TestFileEditorInput(resource, typeId));
	}

	test('groups basics', async function () {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		const [part] = await createPart(instantiationService);

		let activeGroupModelChangeCounter = 0;
		const activeGroupModelChangeListener = part.onDidChangeActiveGroup(() => {
			activeGroupModelChangeCounter++;
		});

		let groupAddedCounter = 0;
		const groupAddedListener = part.onDidAddGroup(() => {
			groupAddedCounter++;
		});

		let groupRemovedCounter = 0;
		const groupRemovedListener = part.onDidRemoveGroup(() => {
			groupRemovedCounter++;
		});

		let groupMovedCounter = 0;
		const groupMovedListener = part.onDidMoveGroup(() => {
			groupMovedCounter++;
		});

		// always a root group
		const rootGroup = part.groups[0];
		assert.strictEqual(isEditorGroup(rootGroup), true);
		assert.strictEqual(part.groups.length, 1);
		assert.strictEqual(part.count, 1);
		assert.strictEqual(rootGroup, part.getGroup(rootGroup.id));
		assert.ok(part.activeGroup === rootGroup);
		assert.strictEqual(rootGroup.label, 'Group 1');

		let mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		assert.strictEqual(mru.length, 1);
		assert.strictEqual(mru[0], rootGroup);

		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
		assert.strictEqual(rightGroup, part.getGroup(rightGroup.id));
		assert.strictEqual(groupAddedCounter, 1);
		assert.strictEqual(part.groups.length, 2);
		assert.strictEqual(part.count, 2);
		assert.ok(part.activeGroup === rootGroup);
		assert.strictEqual(rootGroup.label, 'Group 1');
		assert.strictEqual(rightGroup.label, 'Group 2');

		mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		assert.strictEqual(mru.length, 2);
		assert.strictEqual(mru[0], rootGroup);
		assert.strictEqual(mru[1], rightGroup);

		assert.strictEqual(activeGroupModelChangeCounter, 0);

		let rootGroupActiveChangeCounter = 0;
		const rootGroupModelChangeListener = rootGroup.onDidModelChange(e => {
			if (e.kind === GroupModelChangeKind.GROUP_ACTIVE) {
				rootGroupActiveChangeCounter++;
			}
		});

		let rightGroupActiveChangeCounter = 0;
		const rightGroupModelChangeListener = rightGroup.onDidModelChange(e => {
			if (e.kind === GroupModelChangeKind.GROUP_ACTIVE) {
				rightGroupActiveChangeCounter++;
			}
		});

		part.activateGroup(rightGroup);
		assert.ok(part.activeGroup === rightGroup);
		assert.strictEqual(activeGroupModelChangeCounter, 1);
		assert.strictEqual(rootGroupActiveChangeCounter, 1);
		assert.strictEqual(rightGroupActiveChangeCounter, 1);

		rootGroupModelChangeListener.dispose();
		rightGroupModelChangeListener.dispose();

		mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		assert.strictEqual(mru.length, 2);
		assert.strictEqual(mru[0], rightGroup);
		assert.strictEqual(mru[1], rootGroup);

		const downGroup = part.addGroup(rightGroup, GroupDirection.DOWN);
		let didDispose = false;
		disposables.add(downGroup.onWillDispose(() => {
			didDispose = true;
		}));
		assert.strictEqual(groupAddedCounter, 2);
		assert.strictEqual(part.groups.length, 3);
		assert.ok(part.activeGroup === rightGroup);
		assert.ok(!downGroup.activeEditorPane);
		assert.strictEqual(rootGroup.label, 'Group 1');
		assert.strictEqual(rightGroup.label, 'Group 2');
		assert.strictEqual(downGroup.label, 'Group 3');

		mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		assert.strictEqual(mru.length, 3);
		assert.strictEqual(mru[0], rightGroup);
		assert.strictEqual(mru[1], rootGroup);
		assert.strictEqual(mru[2], downGroup);

		const gridOrder = part.getGroups(GroupsOrder.GRID_APPEARANCE);
		assert.strictEqual(gridOrder.length, 3);
		assert.strictEqual(gridOrder[0], rootGroup);
		assert.strictEqual(gridOrder[0].index, 0);
		assert.strictEqual(gridOrder[1], rightGroup);
		assert.strictEqual(gridOrder[1].index, 1);
		assert.strictEqual(gridOrder[2], downGroup);
		assert.strictEqual(gridOrder[2].index, 2);

		part.moveGroup(downGroup, rightGroup, GroupDirection.DOWN);
		assert.strictEqual(groupMovedCounter, 1);

		part.removeGroup(downGroup);
		assert.ok(!part.getGroup(downGroup.id));
		assert.ok(!part.hasGroup(downGroup.id));
		assert.strictEqual(didDispose, true);
		assert.strictEqual(groupRemovedCounter, 1);
		assert.strictEqual(part.groups.length, 2);
		assert.ok(part.activeGroup === rightGroup);
		assert.strictEqual(rootGroup.label, 'Group 1');
		assert.strictEqual(rightGroup.label, 'Group 2');

		mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		assert.strictEqual(mru.length, 2);
		assert.strictEqual(mru[0], rightGroup);
		assert.strictEqual(mru[1], rootGroup);

		const rightGroupContextKeyService = part.activeGroup.scopedContextKeyService;
		const rootGroupContextKeyService = rootGroup.scopedContextKeyService;

		assert.ok(rightGroupContextKeyService);
		assert.ok(rootGroupContextKeyService);
		assert.ok(rightGroupContextKeyService !== rootGroupContextKeyService);

		part.removeGroup(rightGroup);
		assert.strictEqual(groupRemovedCounter, 2);
		assert.strictEqual(part.groups.length, 1);
		assert.ok(part.activeGroup === rootGroup);

		mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		assert.strictEqual(mru.length, 1);
		assert.strictEqual(mru[0], rootGroup);

		part.removeGroup(rootGroup); // cannot remove root group
		assert.strictEqual(part.groups.length, 1);
		assert.strictEqual(groupRemovedCounter, 2);
		assert.ok(part.activeGroup === rootGroup);

		part.setGroupOrientation(part.orientation === GroupOrientation.HORIZONTAL ? GroupOrientation.VERTICAL : GroupOrientation.HORIZONTAL);

		activeGroupModelChangeListener.dispose();
		groupAddedListener.dispose();
		groupRemovedListener.dispose();
		groupMovedListener.dispose();
	});

	test('sideGroup', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		const [part] = await createPart(instantiationService);

		const rootGroup = part.activeGroup;

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);

		await rootGroup.openEditor(input1, { pinned: true });
		await part.sideGroup.openEditor(input2, { pinned: true });
		assert.strictEqual(part.count, 2);

		part.activateGroup(rootGroup);
		await part.sideGroup.openEditor(input3, { pinned: true });
		assert.strictEqual(part.count, 2);
	});

	test('save & restore state', async function () {
		const [part, instantiationService] = await createPart();

		const rootGroup = part.groups[0];
		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
		const downGroup = part.addGroup(rightGroup, GroupDirection.DOWN);

		const rootGroupInput = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		await rootGroup.openEditor(rootGroupInput, { pinned: true });

		const rightGroupInput = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		await rightGroup.openEditor(rightGroupInput, { pinned: true });

		assert.strictEqual(part.groups.length, 3);

		part.testSaveState();
		part.dispose();

		const [restoredPart] = await createPart(instantiationService);

		assert.strictEqual(restoredPart.groups.length, 3);
		assert.ok(restoredPart.getGroup(rootGroup.id));
		assert.ok(restoredPart.hasGroup(rootGroup.id));
		assert.ok(restoredPart.getGroup(rightGroup.id));
		assert.ok(restoredPart.hasGroup(rightGroup.id));
		assert.ok(restoredPart.getGroup(downGroup.id));
		assert.ok(restoredPart.hasGroup(downGroup.id));

		restoredPart.clearState();
	});

	test('groups index / labels', async function () {
		const [part] = await createPart();

		const rootGroup = part.groups[0];
		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
		const downGroup = part.addGroup(rightGroup, GroupDirection.DOWN);

		let groupIndexChangedCounter = 0;
		const groupIndexChangedListener = part.onDidChangeGroupIndex(() => {
			groupIndexChangedCounter++;
		});

		let indexChangeCounter = 0;
		const labelChangeListener = downGroup.onDidModelChange(e => {
			if (e.kind === GroupModelChangeKind.GROUP_INDEX) {
				indexChangeCounter++;
			}
		});

		assert.strictEqual(rootGroup.index, 0);
		assert.strictEqual(rightGroup.index, 1);
		assert.strictEqual(downGroup.index, 2);
		assert.strictEqual(rootGroup.label, 'Group 1');
		assert.strictEqual(rightGroup.label, 'Group 2');
		assert.strictEqual(downGroup.label, 'Group 3');

		part.removeGroup(rightGroup);
		assert.strictEqual(rootGroup.index, 0);
		assert.strictEqual(downGroup.index, 1);
		assert.strictEqual(rootGroup.label, 'Group 1');
		assert.strictEqual(downGroup.label, 'Group 2');
		assert.strictEqual(indexChangeCounter, 1);
		assert.strictEqual(groupIndexChangedCounter, 1);

		part.moveGroup(downGroup, rootGroup, GroupDirection.UP);
		assert.strictEqual(downGroup.index, 0);
		assert.strictEqual(rootGroup.index, 1);
		assert.strictEqual(downGroup.label, 'Group 1');
		assert.strictEqual(rootGroup.label, 'Group 2');
		assert.strictEqual(indexChangeCounter, 2);
		assert.strictEqual(groupIndexChangedCounter, 3);

		const newFirstGroup = part.addGroup(downGroup, GroupDirection.UP);
		assert.strictEqual(newFirstGroup.index, 0);
		assert.strictEqual(downGroup.index, 1);
		assert.strictEqual(rootGroup.index, 2);
		assert.strictEqual(newFirstGroup.label, 'Group 1');
		assert.strictEqual(downGroup.label, 'Group 2');
		assert.strictEqual(rootGroup.label, 'Group 3');
		assert.strictEqual(indexChangeCounter, 3);
		assert.strictEqual(groupIndexChangedCounter, 6);

		labelChangeListener.dispose();
		groupIndexChangedListener.dispose();
	});

	test('groups label', async function () {
		const [part] = await createPart();

		const rootGroup = part.groups[0];
		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

		let partLabelChangedCounter = 0;
		const groupIndexChangedListener = part.onDidChangeGroupLabel(() => {
			partLabelChangedCounter++;
		});

		let rootGroupLabelChangeCounter = 0;
		const rootGroupLabelChangeListener = rootGroup.onDidModelChange(e => {
			if (e.kind === GroupModelChangeKind.GROUP_LABEL) {
				rootGroupLabelChangeCounter++;
			}
		});

		let rightGroupLabelChangeCounter = 0;
		const rightGroupLabelChangeListener = rightGroup.onDidModelChange(e => {
			if (e.kind === GroupModelChangeKind.GROUP_LABEL) {
				rightGroupLabelChangeCounter++;
			}
		});

		assert.strictEqual(rootGroup.label, 'Group 1');
		assert.strictEqual(rightGroup.label, 'Group 2');

		part.notifyGroupsLabelChange('Window 2');

		assert.strictEqual(rootGroup.label, 'Window 2: Group 1');
		assert.strictEqual(rightGroup.label, 'Window 2: Group 2');

		assert.strictEqual(rootGroupLabelChangeCounter, 1);
		assert.strictEqual(rightGroupLabelChangeCounter, 1);
		assert.strictEqual(partLabelChangedCounter, 2);

		part.notifyGroupsLabelChange('Window 3');

		assert.strictEqual(rootGroup.label, 'Window 3: Group 1');
		assert.strictEqual(rightGroup.label, 'Window 3: Group 2');

		assert.strictEqual(rootGroupLabelChangeCounter, 2);
		assert.strictEqual(rightGroupLabelChangeCounter, 2);
		assert.strictEqual(partLabelChangedCounter, 4);

		rootGroupLabelChangeListener.dispose();
		rightGroupLabelChangeListener.dispose();
		groupIndexChangedListener.dispose();
	});

	test('copy/merge groups', async () => {
		const [part] = await createPart();

		let groupAddedCounter = 0;
		const groupAddedListener = part.onDidAddGroup(() => {
			groupAddedCounter++;
		});

		let groupRemovedCounter = 0;
		const groupRemovedListener = part.onDidRemoveGroup(() => {
			groupRemovedCounter++;
		});

		const rootGroup = part.groups[0];
		let rootGroupDisposed = false;
		const disposeListener = rootGroup.onWillDispose(() => {
			rootGroupDisposed = true;
		});

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);

		await rootGroup.openEditor(input, { pinned: true });
		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
		part.activateGroup(rightGroup);
		const downGroup = part.copyGroup(rootGroup, rightGroup, GroupDirection.DOWN);
		assert.strictEqual(groupAddedCounter, 2);
		assert.strictEqual(downGroup.count, 1);
		assert.ok(downGroup.activeEditor instanceof TestFileEditorInput);
		let res = part.mergeGroup(rootGroup, rightGroup, { mode: MergeGroupMode.COPY_EDITORS });
		assert.strictEqual(res, true);
		assert.strictEqual(rightGroup.count, 1);
		assert.ok(rightGroup.activeEditor instanceof TestFileEditorInput);
		res = part.mergeGroup(rootGroup, rightGroup, { mode: MergeGroupMode.MOVE_EDITORS });
		assert.strictEqual(res, true);
		assert.strictEqual(rootGroup.count, 0);
		res = part.mergeGroup(rootGroup, downGroup);
		assert.strictEqual(res, true);
		assert.strictEqual(groupRemovedCounter, 1);
		assert.strictEqual(rootGroupDisposed, true);

		groupAddedListener.dispose();
		groupRemovedListener.dispose();
		disposeListener.dispose();
		part.dispose();
	});

	test('merge all groups', async () => {
		const [part] = await createPart();

		const rootGroup = part.groups[0];

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);

		await rootGroup.openEditor(input1, { pinned: true });

		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
		await rightGroup.openEditor(input2, { pinned: true });

		const downGroup = part.copyGroup(rootGroup, rightGroup, GroupDirection.DOWN);
		await downGroup.openEditor(input3, { pinned: true });

		part.activateGroup(rootGroup);

		assert.strictEqual(rootGroup.count, 1);

		const result = part.mergeAllGroups(part.activeGroup);
		assert.strictEqual(result, true);
		assert.strictEqual(rootGroup.count, 3);

		part.dispose();
	});

	test('whenReady / whenRestored', async () => {
		const [part] = await createPart();

		await part.whenReady;
		assert.strictEqual(part.isReady, true);
		await part.whenRestored;
	});

	test('options', async () => {
		const [part] = await createPart();

		let oldOptions!: IEditorPartOptions;
		let newOptions!: IEditorPartOptions;
		disposables.add(part.onDidChangeEditorPartOptions(event => {
			oldOptions = event.oldPartOptions;
			newOptions = event.newPartOptions;
		}));

		const currentOptions = part.partOptions;
		assert.ok(currentOptions);

		disposables.add(part.enforcePartOptions({ showTabs: 'single' }));
		assert.strictEqual(part.partOptions.showTabs, 'single');
		assert.strictEqual(newOptions.showTabs, 'single');
		assert.strictEqual(oldOptions, currentOptions);
	});

	test('editor basics', async function () {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		let activeEditorChangeCounter = 0;
		let editorDidOpenCounter = 0;
		const editorOpenEvents: IGroupModelChangeEvent[] = [];
		let editorCloseCounter = 0;
		const editorCloseEvents: IGroupModelChangeEvent[] = [];
		let editorPinCounter = 0;
		let editorStickyCounter = 0;
		let editorCapabilitiesCounter = 0;
		const editorGroupModelChangeListener = group.onDidModelChange(e => {
			if (e.kind === GroupModelChangeKind.EDITOR_OPEN) {
				assert.ok(e.editor);
				editorDidOpenCounter++;
				editorOpenEvents.push(e);
			} else if (e.kind === GroupModelChangeKind.EDITOR_PIN) {
				assert.ok(e.editor);
				editorPinCounter++;
			} else if (e.kind === GroupModelChangeKind.EDITOR_STICKY) {
				assert.ok(e.editor);
				editorStickyCounter++;
			} else if (e.kind === GroupModelChangeKind.EDITOR_CAPABILITIES) {
				assert.ok(e.editor);
				editorCapabilitiesCounter++;
			} else if (e.kind === GroupModelChangeKind.EDITOR_CLOSE) {
				assert.ok(e.editor);
				editorCloseCounter++;
				editorCloseEvents.push(e);
			}
		});
		const activeEditorChangeListener = group.onDidActiveEditorChange(e => {
			assert.ok(e.editor);
			activeEditorChangeCounter++;
		});

		let editorCloseCounter1 = 0;
		const editorCloseListener = group.onDidCloseEditor(() => {
			editorCloseCounter1++;
		});

		let editorWillCloseCounter = 0;
		const editorWillCloseListener = group.onWillCloseEditor(() => {
			editorWillCloseCounter++;
		});

		let editorDidCloseCounter = 0;
		const editorDidCloseListener = group.onDidCloseEditor(() => {
			editorDidCloseCounter++;
		});

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputInactive = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);

		await group.openEditor(input, { pinned: true });
		await group.openEditor(inputInactive, { inactive: true });

		assert.strictEqual(group.isActive(input), true);
		assert.strictEqual(group.isActive(inputInactive), false);
		assert.strictEqual(group.contains(input), true);
		assert.strictEqual(group.contains(inputInactive), true);
		assert.strictEqual(group.isEmpty, false);
		assert.strictEqual(group.count, 2);
		assert.strictEqual(editorCapabilitiesCounter, 0);
		assert.strictEqual(editorDidOpenCounter, 2);
		assert.strictEqual((editorOpenEvents[0] as IGroupEditorOpenEvent).editorIndex, 0);
		assert.strictEqual((editorOpenEvents[1] as IGroupEditorOpenEvent).editorIndex, 1);
		assert.strictEqual(editorOpenEvents[0].editor, input);
		assert.strictEqual(editorOpenEvents[1].editor, inputInactive);
		assert.strictEqual(activeEditorChangeCounter, 1);
		assert.strictEqual(group.getEditorByIndex(0), input);
		assert.strictEqual(group.getEditorByIndex(1), inputInactive);
		assert.strictEqual(group.getIndexOfEditor(input), 0);
		assert.strictEqual(group.getIndexOfEditor(inputInactive), 1);
		assert.strictEqual(group.isFirst(input), true);
		assert.strictEqual(group.isFirst(inputInactive), false);
		assert.strictEqual(group.isLast(input), false);
		assert.strictEqual(group.isLast(inputInactive), true);

		input.capabilities = EditorInputCapabilities.RequiresTrust;
		assert.strictEqual(editorCapabilitiesCounter, 1);

		inputInactive.capabilities = EditorInputCapabilities.Singleton;
		assert.strictEqual(editorCapabilitiesCounter, 2);

		assert.strictEqual(group.previewEditor, inputInactive);
		assert.strictEqual(group.isPinned(inputInactive), false);
		group.pinEditor(inputInactive);
		assert.strictEqual(editorPinCounter, 1);
		assert.strictEqual(group.isPinned(inputInactive), true);
		assert.ok(!group.previewEditor);

		assert.strictEqual(group.activeEditor, input);
		assert.strictEqual(group.activeEditorPane?.getId(), TEST_EDITOR_ID);
		assert.strictEqual(group.count, 2);

		const mru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
		assert.strictEqual(mru[0], input);
		assert.strictEqual(mru[1], inputInactive);

		await group.openEditor(inputInactive);
		assert.strictEqual(activeEditorChangeCounter, 2);
		assert.strictEqual(group.activeEditor, inputInactive);

		await group.openEditor(input);
		const closed = await group.closeEditor(inputInactive);
		assert.strictEqual(closed, true);

		assert.strictEqual(activeEditorChangeCounter, 3);
		assert.strictEqual(editorCloseCounter, 1);
		assert.strictEqual((editorCloseEvents[0] as IGroupEditorOpenEvent).editorIndex, 1);
		assert.strictEqual(editorCloseEvents[0].editor, inputInactive);
		assert.strictEqual(editorCloseCounter1, 1);
		assert.strictEqual(editorWillCloseCounter, 1);
		assert.strictEqual(editorDidCloseCounter, 1);

		assert.ok(inputInactive.gotDisposed);

		assert.strictEqual(group.activeEditor, input);

		assert.strictEqual(editorStickyCounter, 0);
		group.stickEditor(input);
		assert.strictEqual(editorStickyCounter, 1);
		group.unstickEditor(input);
		assert.strictEqual(editorStickyCounter, 2);

		editorCloseListener.dispose();
		editorWillCloseListener.dispose();
		editorDidCloseListener.dispose();
		activeEditorChangeListener.dispose();
		editorGroupModelChangeListener.dispose();
	});

	test('openEditors / closeEditors', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputInactive = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([
			{ editor: input, options: { pinned: true } },
			{ editor: inputInactive }
		]);

		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.getEditorByIndex(0), input);
		assert.strictEqual(group.getEditorByIndex(1), inputInactive);

		await group.closeEditors([input, inputInactive]);

		assert.ok(input.gotDisposed);
		assert.ok(inputInactive.gotDisposed);

		assert.strictEqual(group.isEmpty, true);
	});

	test('closeEditor - dirty editor handling', async () => {
		const [part, instantiationService] = await createPart();

		const accessor = instantiationService.createInstance(TestServiceAccessor);
		accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);

		const group = part.activeGroup;

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		input.dirty = true;

		await group.openEditor(input);

		accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
		let closed = await group.closeEditor(input);
		assert.strictEqual(closed, false);

		assert.ok(!input.gotDisposed);

		accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
		closed = await group.closeEditor(input);
		assert.strictEqual(closed, true);

		assert.ok(input.gotDisposed);
	});

	test('closeEditor (one, opened in multiple groups)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const rightGroup = part.addGroup(group, GroupDirection.RIGHT);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputInactive = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
		await rightGroup.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);

		let closed = await rightGroup.closeEditor(input);
		assert.strictEqual(closed, true);

		assert.ok(!input.gotDisposed);

		closed = await group.closeEditor(input);
		assert.strictEqual(closed, true);

		assert.ok(input.gotDisposed);
	});

	test('closeEditors - dirty editor handling', async () => {
		const [part, instantiationService] = await createPart();

		const accessor = instantiationService.createInstance(TestServiceAccessor);
		accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
		let closeResult = false;

		const group = part.activeGroup;

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		input1.dirty = true;

		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);

		await group.openEditor(input1);
		await group.openEditor(input2);

		accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
		closeResult = await group.closeEditors([input1, input2]);
		assert.strictEqual(closeResult, false);

		assert.ok(!input1.gotDisposed);
		assert.ok(!input2.gotDisposed);

		accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
		closeResult = await group.closeEditors([input1, input2]);
		assert.strictEqual(closeResult, true);

		assert.ok(input1.gotDisposed);
		assert.ok(input2.gotDisposed);
	});

	test('closeEditors (except one)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([
			{ editor: input1, options: { pinned: true } },
			{ editor: input2, options: { pinned: true } },
			{ editor: input3 }
		]);

		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(group.getEditorByIndex(1), input2);
		assert.strictEqual(group.getEditorByIndex(2), input3);

		await group.closeEditors({ except: input2 });
		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.getEditorByIndex(0), input2);
	});

	test('closeEditors (except one, sticky editor)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([
			{ editor: input1, options: { pinned: true, sticky: true } },
			{ editor: input2, options: { pinned: true } },
			{ editor: input3 }
		]);

		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(group.getEditorByIndex(1), input2);
		assert.strictEqual(group.getEditorByIndex(2), input3);

		await group.closeEditors({ except: input2, excludeSticky: true });

		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(group.getEditorByIndex(1), input2);

		await group.closeEditors({ except: input2 });

		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.stickyCount, 0);
		assert.strictEqual(group.getEditorByIndex(0), input2);
	});

	test('closeEditors (saved only)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([
			{ editor: input1, options: { pinned: true } },
			{ editor: input2, options: { pinned: true } },
			{ editor: input3 }
		]);

		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(group.getEditorByIndex(1), input2);
		assert.strictEqual(group.getEditorByIndex(2), input3);

		await group.closeEditors({ savedOnly: true });
		assert.strictEqual(group.count, 0);
	});

	test('closeEditors (saved only, sticky editor)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([
			{ editor: input1, options: { pinned: true, sticky: true } },
			{ editor: input2, options: { pinned: true } },
			{ editor: input3 }
		]);

		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(group.getEditorByIndex(1), input2);
		assert.strictEqual(group.getEditorByIndex(2), input3);

		await group.closeEditors({ savedOnly: true, excludeSticky: true });

		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.getEditorByIndex(0), input1);

		await group.closeEditors({ savedOnly: true });
		assert.strictEqual(group.count, 0);
	});

	test('closeEditors (direction: right)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([
			{ editor: input1, options: { pinned: true } },
			{ editor: input2, options: { pinned: true } },
			{ editor: input3 }
		]);

		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(group.getEditorByIndex(1), input2);
		assert.strictEqual(group.getEditorByIndex(2), input3);

		await group.closeEditors({ direction: CloseDirection.RIGHT, except: input2 });
		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(group.getEditorByIndex(1), input2);
	});

	test('closeEditors (direction: right, sticky editor)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([
			{ editor: input1, options: { pinned: true, sticky: true } },
			{ editor: input2, options: { pinned: true } },
			{ editor: input3 }
		]);

		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(group.getEditorByIndex(1), input2);
		assert.strictEqual(group.getEditorByIndex(2), input3);

		await group.closeEditors({ direction: CloseDirection.RIGHT, except: input2, excludeSticky: true });
		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(group.getEditorByIndex(1), input2);

		await group.closeEditors({ direction: CloseDirection.RIGHT, except: input2 });
		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(group.getEditorByIndex(1), input2);
	});

	test('closeEditors (direction: left)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([
			{ editor: input1, options: { pinned: true } },
			{ editor: input2, options: { pinned: true } },
			{ editor: input3 }
		]);

		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(group.getEditorByIndex(1), input2);
		assert.strictEqual(group.getEditorByIndex(2), input3);

		await group.closeEditors({ direction: CloseDirection.LEFT, except: input2 });
		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.getEditorByIndex(0), input2);
		assert.strictEqual(group.getEditorByIndex(1), input3);
	});

	test('closeEditors (direction: left, sticky editor)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([
			{ editor: input1, options: { pinned: true, sticky: true } },
			{ editor: input2, options: { pinned: true } },
			{ editor: input3 }
		]);

		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(group.getEditorByIndex(1), input2);
		assert.strictEqual(group.getEditorByIndex(2), input3);

		await group.closeEditors({ direction: CloseDirection.LEFT, except: input2, excludeSticky: true });
		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(group.getEditorByIndex(1), input2);
		assert.strictEqual(group.getEditorByIndex(2), input3);

		await group.closeEditors({ direction: CloseDirection.LEFT, except: input2 });
		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.getEditorByIndex(0), input2);
		assert.strictEqual(group.getEditorByIndex(1), input3);
	});

	test('closeAllEditors', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputInactive = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([
			{ editor: input, options: { pinned: true } },
			{ editor: inputInactive }
		]);

		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.getEditorByIndex(0), input);
		assert.strictEqual(group.getEditorByIndex(1), inputInactive);

		await group.closeAllEditors();
		assert.strictEqual(group.isEmpty, true);
	});

	test('closeAllEditors - dirty editor handling', async () => {
		const [part, instantiationService] = await createPart();
		let closeResult = true;

		const accessor = instantiationService.createInstance(TestServiceAccessor);
		accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);

		const group = part.activeGroup;

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		input1.dirty = true;

		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);

		await group.openEditor(input1);
		await group.openEditor(input2);

		accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
		closeResult = await group.closeAllEditors();

		assert.strictEqual(closeResult, false);
		assert.ok(!input1.gotDisposed);
		assert.ok(!input2.gotDisposed);

		accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
		closeResult = await group.closeAllEditors();

		assert.strictEqual(closeResult, true);
		assert.ok(input1.gotDisposed);
		assert.ok(input2.gotDisposed);
	});

	test('closeAllEditors (sticky editor)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputInactive = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([
			{ editor: input, options: { pinned: true, sticky: true } },
			{ editor: inputInactive }
		]);

		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.stickyCount, 1);

		await group.closeAllEditors({ excludeSticky: true });

		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.getEditorByIndex(0), input);

		await group.closeAllEditors();

		assert.strictEqual(group.isEmpty, true);
	});

	test('moveEditor (same group)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputInactive = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);

		const moveEvents: IGroupModelChangeEvent[] = [];
		const editorGroupModelChangeListener = group.onDidModelChange(e => {
			if (e.kind === GroupModelChangeKind.EDITOR_MOVE) {
				assert.ok(e.editor);
				moveEvents.push(e);
			}
		});

		await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.getEditorByIndex(0), input);
		assert.strictEqual(group.getEditorByIndex(1), inputInactive);
		group.moveEditor(inputInactive, group, { index: 0 });
		assert.strictEqual(moveEvents.length, 1);
		assert.strictEqual((moveEvents[0] as IGroupEditorOpenEvent).editorIndex, 0);
		assert.strictEqual((moveEvents[0] as IGroupEditorMoveEvent).oldEditorIndex, 1);
		assert.strictEqual(moveEvents[0].editor, inputInactive);
		assert.strictEqual(group.getEditorByIndex(0), inputInactive);
		assert.strictEqual(group.getEditorByIndex(1), input);

		const res = group.moveEditors([{ editor: inputInactive, options: { index: 1 } }], group);
		assert.strictEqual(res, true);
		assert.strictEqual(moveEvents.length, 2);
		assert.strictEqual((moveEvents[1] as IGroupEditorOpenEvent).editorIndex, 1);
		assert.strictEqual((moveEvents[1] as IGroupEditorMoveEvent).oldEditorIndex, 0);
		assert.strictEqual(moveEvents[1].editor, inputInactive);
		assert.strictEqual(group.getEditorByIndex(0), input);
		assert.strictEqual(group.getEditorByIndex(1), inputInactive);

		editorGroupModelChangeListener.dispose();
	});

	test('moveEditor (across groups)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const rightGroup = part.addGroup(group, GroupDirection.RIGHT);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputInactive = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.getEditorByIndex(0), input);
		assert.strictEqual(group.getEditorByIndex(1), inputInactive);
		group.moveEditor(inputInactive, rightGroup, { index: 0 });
		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.getEditorByIndex(0), input);
		assert.strictEqual(rightGroup.count, 1);
		assert.strictEqual(rightGroup.getEditorByIndex(0), inputInactive);
	});

	test('moveEditors (across groups)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const rightGroup = part.addGroup(group, GroupDirection.RIGHT);

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([{ editor: input1, options: { pinned: true } }, { editor: input2, options: { pinned: true } }, { editor: input3, options: { pinned: true } }]);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(group.getEditorByIndex(1), input2);
		assert.strictEqual(group.getEditorByIndex(2), input3);
		group.moveEditors([{ editor: input2 }, { editor: input3 }], rightGroup);
		assert.strictEqual(group.count, 1);
		assert.strictEqual(rightGroup.count, 2);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(rightGroup.getEditorByIndex(0), input2);
		assert.strictEqual(rightGroup.getEditorByIndex(1), input3);
	});

	test('copyEditor (across groups)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const rightGroup = part.addGroup(group, GroupDirection.RIGHT);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputInactive = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.getEditorByIndex(0), input);
		assert.strictEqual(group.getEditorByIndex(1), inputInactive);
		group.copyEditor(inputInactive, rightGroup, { index: 0 });
		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.getEditorByIndex(0), input);
		assert.strictEqual(group.getEditorByIndex(1), inputInactive);
		assert.strictEqual(rightGroup.count, 1);
		assert.strictEqual(rightGroup.getEditorByIndex(0), inputInactive);
	});

	test('copyEditors (across groups)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const rightGroup = part.addGroup(group, GroupDirection.RIGHT);

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([{ editor: input1, options: { pinned: true } }, { editor: input2, options: { pinned: true } }, { editor: input3, options: { pinned: true } }]);
		assert.strictEqual(group.getEditorByIndex(0), input1);
		assert.strictEqual(group.getEditorByIndex(1), input2);
		assert.strictEqual(group.getEditorByIndex(2), input3);
		group.copyEditors([{ editor: input1 }, { editor: input2 }, { editor: input3 }], rightGroup);
		[group, rightGroup].forEach(group => {
			assert.strictEqual(group.getEditorByIndex(0), input1);
			assert.strictEqual(group.getEditorByIndex(1), input2);
			assert.strictEqual(group.getEditorByIndex(2), input3);
		});
	});

	test('replaceEditors', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputInactive = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);

		await group.openEditor(input);
		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.getEditorByIndex(0), input);

		await group.replaceEditors([{ editor: input, replacement: inputInactive }]);
		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.getEditorByIndex(0), inputInactive);
	});

	test('replaceEditors - dirty editor handling', async () => {
		const [part, instantiationService] = await createPart();

		const accessor = instantiationService.createInstance(TestServiceAccessor);
		accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);

		const group = part.activeGroup;

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		input1.dirty = true;

		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);

		await group.openEditor(input1);
		assert.strictEqual(group.activeEditor, input1);

		accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
		await group.replaceEditors([{ editor: input1, replacement: input2 }]);

		assert.strictEqual(group.activeEditor, input1);
		assert.ok(!input1.gotDisposed);

		accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
		await group.replaceEditors([{ editor: input1, replacement: input2 }]);

		assert.strictEqual(group.activeEditor, input2);
		assert.ok(input1.gotDisposed);
	});

	test('replaceEditors - forceReplaceDirty flag', async () => {
		const [part, instantiationService] = await createPart();

		const accessor = instantiationService.createInstance(TestServiceAccessor);
		accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);

		const group = part.activeGroup;

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		input1.dirty = true;

		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);

		await group.openEditor(input1);
		assert.strictEqual(group.activeEditor, input1);
		accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
		await group.replaceEditors([{ editor: input1, replacement: input2, forceReplaceDirty: false }]);

		assert.strictEqual(group.activeEditor, input1);
		assert.ok(!input1.gotDisposed);

		await group.replaceEditors([{ editor: input1, replacement: input2, forceReplaceDirty: true }]);

		assert.strictEqual(group.activeEditor, input2);
		assert.ok(input1.gotDisposed);
	});

	test('replaceEditors - proper index handling', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);
		const input4 = createTestFileEditorInput(URI.file('foo/bar4'), TEST_EDITOR_INPUT_ID);
		const input5 = createTestFileEditorInput(URI.file('foo/bar5'), TEST_EDITOR_INPUT_ID);

		const input6 = createTestFileEditorInput(URI.file('foo/bar6'), TEST_EDITOR_INPUT_ID);
		const input7 = createTestFileEditorInput(URI.file('foo/bar7'), TEST_EDITOR_INPUT_ID);
		const input8 = createTestFileEditorInput(URI.file('foo/bar8'), TEST_EDITOR_INPUT_ID);

		await group.openEditor(input1, { pinned: true });
		await group.openEditor(input2, { pinned: true });
		await group.openEditor(input3, { pinned: true });
		await group.openEditor(input4, { pinned: true });
		await group.openEditor(input5, { pinned: true });

		await group.replaceEditors([
			{ editor: input1, replacement: input6 },
			{ editor: input3, replacement: input7 },
			{ editor: input5, replacement: input8 }
		]);

		assert.strictEqual(group.getEditorByIndex(0), input6);
		assert.strictEqual(group.getEditorByIndex(1), input2);
		assert.strictEqual(group.getEditorByIndex(2), input7);
		assert.strictEqual(group.getEditorByIndex(3), input4);
		assert.strictEqual(group.getEditorByIndex(4), input8);
	});

	test('replaceEditors - should be able to replace when side by side editor is involved with same input side by side', async () => {
		const [part, instantiationService] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const sideBySideInput = instantiationService.createInstance(SideBySideEditorInput, undefined, undefined, input, input);

		await group.openEditor(input);
		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.getEditorByIndex(0), input);

		await group.replaceEditors([{ editor: input, replacement: sideBySideInput }]);
		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.getEditorByIndex(0), sideBySideInput);

		await group.replaceEditors([{ editor: sideBySideInput, replacement: input }]);
		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.getEditorByIndex(0), input);
	});

	test('find editors', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		const group2 = part.addGroup(group, GroupDirection.RIGHT);
		assert.strictEqual(group.isEmpty, true);

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar1'), `${TEST_EDITOR_INPUT_ID}-1`);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);
		const input4 = createTestFileEditorInput(URI.file('foo/bar4'), TEST_EDITOR_INPUT_ID);
		const input5 = createTestFileEditorInput(URI.file('foo/bar4'), `${TEST_EDITOR_INPUT_ID}-1`);

		await group.openEditor(input1, { pinned: true });
		await group.openEditor(input2, { pinned: true });
		await group.openEditor(input3, { pinned: true });
		await group.openEditor(input4, { pinned: true });
		await group2.openEditor(input5, { pinned: true });

		let foundEditors = group.findEditors(URI.file('foo/bar1'));
		assert.strictEqual(foundEditors.length, 2);
		foundEditors = group2.findEditors(URI.file('foo/bar4'));
		assert.strictEqual(foundEditors.length, 1);
	});

	test('find editors (side by side support)', async () => {
		const [part, instantiationService] = await createPart();

		const accessor = instantiationService.createInstance(TestServiceAccessor);

		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const secondaryInput = createTestFileEditorInput(URI.file('foo/bar-secondary'), TEST_EDITOR_INPUT_ID);
		const primaryInput = createTestFileEditorInput(URI.file('foo/bar-primary'), `${TEST_EDITOR_INPUT_ID}-1`);

		const sideBySideEditor = new SideBySideEditorInput(undefined, undefined, secondaryInput, primaryInput, accessor.editorService);
		await group.openEditor(sideBySideEditor, { pinned: true });

		let foundEditors = group.findEditors(URI.file('foo/bar-secondary'));
		assert.strictEqual(foundEditors.length, 0);

		foundEditors = group.findEditors(URI.file('foo/bar-secondary'), { supportSideBySide: SideBySideEditor.PRIMARY });
		assert.strictEqual(foundEditors.length, 0);

		foundEditors = group.findEditors(URI.file('foo/bar-primary'), { supportSideBySide: SideBySideEditor.PRIMARY });
		assert.strictEqual(foundEditors.length, 1);

		foundEditors = group.findEditors(URI.file('foo/bar-secondary'), { supportSideBySide: SideBySideEditor.SECONDARY });
		assert.strictEqual(foundEditors.length, 1);

		foundEditors = group.findEditors(URI.file('foo/bar-primary'), { supportSideBySide: SideBySideEditor.SECONDARY });
		assert.strictEqual(foundEditors.length, 0);

		foundEditors = group.findEditors(URI.file('foo/bar-secondary'), { supportSideBySide: SideBySideEditor.ANY });
		assert.strictEqual(foundEditors.length, 1);

		foundEditors = group.findEditors(URI.file('foo/bar-primary'), { supportSideBySide: SideBySideEditor.ANY });
		assert.strictEqual(foundEditors.length, 1);
	});

	test('find neighbour group (left/right)', async function () {
		const [part] = await createPart();
		const rootGroup = part.activeGroup;
		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

		assert.strictEqual(rightGroup, part.findGroup({ direction: GroupDirection.RIGHT }, rootGroup));
		assert.strictEqual(rootGroup, part.findGroup({ direction: GroupDirection.LEFT }, rightGroup));
	});

	test('find neighbour group (up/down)', async function () {
		const [part] = await createPart();
		const rootGroup = part.activeGroup;
		const downGroup = part.addGroup(rootGroup, GroupDirection.DOWN);

		assert.strictEqual(downGroup, part.findGroup({ direction: GroupDirection.DOWN }, rootGroup));
		assert.strictEqual(rootGroup, part.findGroup({ direction: GroupDirection.UP }, downGroup));
	});

	test('find group by location (left/right)', async function () {
		const [part] = await createPart();
		const rootGroup = part.activeGroup;
		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
		const downGroup = part.addGroup(rightGroup, GroupDirection.DOWN);

		assert.strictEqual(rootGroup, part.findGroup({ location: GroupLocation.FIRST }));
		assert.strictEqual(downGroup, part.findGroup({ location: GroupLocation.LAST }));

		assert.strictEqual(rightGroup, part.findGroup({ location: GroupLocation.NEXT }, rootGroup));
		assert.strictEqual(rootGroup, part.findGroup({ location: GroupLocation.PREVIOUS }, rightGroup));

		assert.strictEqual(downGroup, part.findGroup({ location: GroupLocation.NEXT }, rightGroup));
		assert.strictEqual(rightGroup, part.findGroup({ location: GroupLocation.PREVIOUS }, downGroup));
	});

	test('applyLayout (2x2)', async function () {
		const [part] = await createPart();

		part.applyLayout({ groups: [{ groups: [{}, {}] }, { groups: [{}, {}] }], orientation: GroupOrientation.HORIZONTAL });

		assert.strictEqual(part.groups.length, 4);
	});

	test('getLayout', async function () {
		const [part] = await createPart();

		// 2x2
		part.applyLayout({ groups: [{ groups: [{}, {}] }, { groups: [{}, {}] }], orientation: GroupOrientation.HORIZONTAL });
		let layout = part.getLayout();

		assert.strictEqual(layout.orientation, GroupOrientation.HORIZONTAL);
		assert.strictEqual(layout.groups.length, 2);
		assert.strictEqual(layout.groups[0].groups!.length, 2);
		assert.strictEqual(layout.groups[1].groups!.length, 2);

		// 3 columns
		part.applyLayout({ groups: [{}, {}, {}], orientation: GroupOrientation.VERTICAL });
		layout = part.getLayout();

		assert.strictEqual(layout.orientation, GroupOrientation.VERTICAL);
		assert.strictEqual(layout.groups.length, 3);
		assert.ok(typeof layout.groups[0].size === 'number');
		assert.ok(typeof layout.groups[1].size === 'number');
		assert.ok(typeof layout.groups[2].size === 'number');
	});

	test('centeredLayout', async function () {
		const [part] = await createPart();

		part.centerLayout(true);

		assert.strictEqual(part.isLayoutCentered(), true);
	});

	test('sticky editors', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;

		assert.strictEqual(group.stickyCount, 0);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 0);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 0);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputInactive = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);

		await group.openEditor(input, { pinned: true });
		await group.openEditor(inputInactive, { inactive: true });

		assert.strictEqual(group.stickyCount, 0);
		assert.strictEqual(group.isSticky(input), false);
		assert.strictEqual(group.isSticky(inputInactive), false);

		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 2);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 2);

		group.stickEditor(input);

		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.isSticky(input), true);
		assert.strictEqual(group.isSticky(inputInactive), false);

		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 1);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 1);

		group.unstickEditor(input);

		assert.strictEqual(group.stickyCount, 0);
		assert.strictEqual(group.isSticky(input), false);
		assert.strictEqual(group.isSticky(inputInactive), false);

		assert.strictEqual(group.getIndexOfEditor(input), 0);
		assert.strictEqual(group.getIndexOfEditor(inputInactive), 1);

		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 2);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 2);

		let editorMoveCounter = 0;
		const editorGroupModelChangeListener = group.onDidModelChange(e => {
			if (e.kind === GroupModelChangeKind.EDITOR_MOVE) {
				assert.ok(e.editor);
				editorMoveCounter++;
			}
		});

		group.stickEditor(inputInactive);

		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.isSticky(input), false);
		assert.strictEqual(group.isSticky(inputInactive), true);

		assert.strictEqual(group.getIndexOfEditor(input), 1);
		assert.strictEqual(group.getIndexOfEditor(inputInactive), 0);
		assert.strictEqual(editorMoveCounter, 1);

		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 1);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 1);

		const inputSticky = createTestFileEditorInput(URI.file('foo/bar/sticky'), TEST_EDITOR_INPUT_ID);

		await group.openEditor(inputSticky, { sticky: true });

		assert.strictEqual(group.stickyCount, 2);
		assert.strictEqual(group.isSticky(input), false);
		assert.strictEqual(group.isSticky(inputInactive), true);
		assert.strictEqual(group.isSticky(inputSticky), true);

		assert.strictEqual(group.getIndexOfEditor(inputInactive), 0);
		assert.strictEqual(group.getIndexOfEditor(inputSticky), 1);
		assert.strictEqual(group.getIndexOfEditor(input), 2);

		await group.openEditor(input, { sticky: true });

		assert.strictEqual(group.stickyCount, 3);
		assert.strictEqual(group.isSticky(input), true);
		assert.strictEqual(group.isSticky(inputInactive), true);
		assert.strictEqual(group.isSticky(inputSticky), true);

		assert.strictEqual(group.getIndexOfEditor(inputInactive), 0);
		assert.strictEqual(group.getIndexOfEditor(inputSticky), 1);
		assert.strictEqual(group.getIndexOfEditor(input), 2);

		editorGroupModelChangeListener.dispose();
	});

	test('sticky: true wins over index', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;

		assert.strictEqual(group.stickyCount, 0);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputInactive = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);
		const inputSticky = createTestFileEditorInput(URI.file('foo/bar/sticky'), TEST_EDITOR_INPUT_ID);

		await group.openEditor(input, { pinned: true });
		await group.openEditor(inputInactive, { inactive: true });
		await group.openEditor(inputSticky, { sticky: true, index: 2 });

		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.isSticky(inputSticky), true);

		assert.strictEqual(group.getIndexOfEditor(input), 1);
		assert.strictEqual(group.getIndexOfEditor(inputInactive), 2);
		assert.strictEqual(group.getIndexOfEditor(inputSticky), 0);
	});

	test('selection: setSelection, isSelected, selectedEditors', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;

		const input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);

		function isSelection(inputs: TestFileEditorInput[]): boolean {
			for (const input of inputs) {
				if (group.selectedEditors.indexOf(input) === -1) {
					return false;
				}
			}
			return inputs.length === group.selectedEditors.length;
		}

		// Active: input1, Selected: input1
		await group.openEditors([input1, input2, input3].map(editor => ({ editor, options: { pinned: true } })));

		assert.strictEqual(group.isActive(input1), true);
		assert.strictEqual(group.isSelected(input1), true);
		assert.strictEqual(group.isSelected(input2), false);
		assert.strictEqual(group.isSelected(input3), false);

		assert.strictEqual(isSelection([input1]), true);

		// Active: input1, Selected: input1, input3
		await group.setSelection(input1, [input3]);

		assert.strictEqual(group.isActive(input1), true);
		assert.strictEqual(group.isSelected(input1), true);
		assert.strictEqual(group.isSelected(input2), false);
		assert.strictEqual(group.isSelected(input3), true);

		assert.strictEqual(isSelection([input1, input3]), true);

		// Active: input2, Selected: input1, input3
		await group.setSelection(input2, [input1, input3]);

		assert.strictEqual(group.isSelected(input1), true);
		assert.strictEqual(group.isActive(input2), true);
		assert.strictEqual(group.isSelected(input2), true);
		assert.strictEqual(group.isSelected(input3), true);

		assert.strictEqual(isSelection([input1, input2, input3]), true);

		await group.setSelection(input1, []);

		// Selected: input3
		assert.strictEqual(group.isActive(input1), true);
		assert.strictEqual(group.isSelected(input1), true);
		assert.strictEqual(group.isSelected(input2), false);
		assert.strictEqual(group.isSelected(input3), false);

		assert.strictEqual(isSelection([input1]), true);
	});

	test('moveEditor with context (across groups)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const rightGroup = part.addGroup(group, GroupDirection.RIGHT);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputInactive = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);
		const thirdInput = createTestFileEditorInput(URI.file('foo/bar/third'), TEST_EDITOR_INPUT_ID);

		let leftFiredCount = 0;
		const leftGroupListener = group.onWillMoveEditor(() => {
			leftFiredCount++;
		});

		let rightFiredCount = 0;
		const rightGroupListener = rightGroup.onWillMoveEditor(() => {
			rightFiredCount++;
		});

		await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }, { editor: thirdInput }]);
		assert.strictEqual(leftFiredCount, 0);
		assert.strictEqual(rightFiredCount, 0);

		let result = group.moveEditor(input, rightGroup);
		assert.strictEqual(result, true);
		assert.strictEqual(leftFiredCount, 1);
		assert.strictEqual(rightFiredCount, 0);

		result = group.moveEditor(inputInactive, rightGroup);
		assert.strictEqual(result, true);
		assert.strictEqual(leftFiredCount, 2);
		assert.strictEqual(rightFiredCount, 0);

		result = rightGroup.moveEditor(inputInactive, group);
		assert.strictEqual(result, true);
		assert.strictEqual(leftFiredCount, 2);
		assert.strictEqual(rightFiredCount, 1);

		leftGroupListener.dispose();
		rightGroupListener.dispose();
	});

	test('moveEditor disabled', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const rightGroup = part.addGroup(group, GroupDirection.RIGHT);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputInactive = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);
		const thirdInput = createTestFileEditorInput(URI.file('foo/bar/third'), TEST_EDITOR_INPUT_ID);

		await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }, { editor: thirdInput }]);

		input.setMoveDisabled('disabled');
		const result = group.moveEditor(input, rightGroup);

		assert.strictEqual(result, false);
		assert.strictEqual(group.count, 3);
	});

	test('onWillOpenEditor', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const rightGroup = part.addGroup(group, GroupDirection.RIGHT);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const secondInput = createTestFileEditorInput(URI.file('foo/bar/second'), TEST_EDITOR_INPUT_ID);
		const thirdInput = createTestFileEditorInput(URI.file('foo/bar/third'), TEST_EDITOR_INPUT_ID);

		let leftFiredCount = 0;
		const leftGroupListener = group.onWillOpenEditor(() => {
			leftFiredCount++;
		});

		let rightFiredCount = 0;
		const rightGroupListener = rightGroup.onWillOpenEditor(() => {
			rightFiredCount++;
		});

		await group.openEditor(input);
		assert.strictEqual(leftFiredCount, 1);
		assert.strictEqual(rightFiredCount, 0);

		rightGroup.openEditor(secondInput);
		assert.strictEqual(leftFiredCount, 1);
		assert.strictEqual(rightFiredCount, 1);

		group.openEditor(thirdInput);
		assert.strictEqual(leftFiredCount, 2);
		assert.strictEqual(rightFiredCount, 1);

		// Ensure move fires the open event too
		rightGroup.moveEditor(secondInput, group);
		assert.strictEqual(leftFiredCount, 3);
		assert.strictEqual(rightFiredCount, 1);

		leftGroupListener.dispose();
		rightGroupListener.dispose();
	});

	test('copyEditor with context (across groups)', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);
		let firedCount = 0;
		const moveListener = group.onWillMoveEditor(() => firedCount++);

		const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputInactive = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);
		await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
		assert.strictEqual(firedCount, 0);

		group.copyEditor(inputInactive, rightGroup, { index: 0 });

		assert.strictEqual(firedCount, 0);
		moveListener.dispose();
	});

	test('locked groups - basics', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;

		const rightGroup = part.addGroup(group, GroupDirection.RIGHT);

		let leftFiredCountFromPart = 0;
		let rightFiredCountFromPart = 0;
		const partListener = part.onDidChangeGroupLocked(g => {
			if (g === group) {
				leftFiredCountFromPart++;
			} else if (g === rightGroup) {
				rightFiredCountFromPart++;
			}
		});

		let leftFiredCountFromGroup = 0;
		const leftGroupListener = group.onDidModelChange(e => {
			if (e.kind === GroupModelChangeKind.GROUP_LOCKED) {
				leftFiredCountFromGroup++;
			}
		});

		let rightFiredCountFromGroup = 0;
		const rightGroupListener = rightGroup.onDidModelChange(e => {
			if (e.kind === GroupModelChangeKind.GROUP_LOCKED) {
				rightFiredCountFromGroup++;
			}
		});

		rightGroup.lock(true);
		rightGroup.lock(true);

		assert.strictEqual(leftFiredCountFromGroup, 0);
		assert.strictEqual(leftFiredCountFromPart, 0);
		assert.strictEqual(rightFiredCountFromGroup, 1);
		assert.strictEqual(rightFiredCountFromPart, 1);

		rightGroup.lock(false);
		rightGroup.lock(false);

		assert.strictEqual(leftFiredCountFromGroup, 0);
		assert.strictEqual(leftFiredCountFromPart, 0);
		assert.strictEqual(rightFiredCountFromGroup, 2);
		assert.strictEqual(rightFiredCountFromPart, 2);

		group.lock(true);
		group.lock(true);

		assert.strictEqual(leftFiredCountFromGroup, 1);
		assert.strictEqual(leftFiredCountFromPart, 1);
		assert.strictEqual(rightFiredCountFromGroup, 2);
		assert.strictEqual(rightFiredCountFromPart, 2);

		group.lock(false);
		group.lock(false);

		assert.strictEqual(leftFiredCountFromGroup, 2);
		assert.strictEqual(leftFiredCountFromPart, 2);
		assert.strictEqual(rightFiredCountFromGroup, 2);
		assert.strictEqual(rightFiredCountFromPart, 2);

		partListener.dispose();
		leftGroupListener.dispose();
		rightGroupListener.dispose();
	});

	test('locked groups - single group is can be locked', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;

		group.lock(true);
		assert.strictEqual(group.isLocked, true);

		const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
		rightGroup.lock(true);

		assert.strictEqual(rightGroup.isLocked, true);

		part.removeGroup(group);
		assert.strictEqual(rightGroup.isLocked, true);

		const rightGroup2 = part.addGroup(rightGroup, GroupDirection.RIGHT);
		rightGroup.lock(true);
		rightGroup2.lock(true);

		assert.strictEqual(rightGroup.isLocked, true);
		assert.strictEqual(rightGroup2.isLocked, true);

		part.removeGroup(rightGroup2);

		assert.strictEqual(rightGroup.isLocked, true);
	});

	test('locked groups - auto locking via setting', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration('workbench', { 'editor': { 'autoLockGroups': { 'testEditorInputForEditorGroupService': true } } });
		instantiationService.stub(IConfigurationService, configurationService);

		const [part] = await createPart(instantiationService);

		const rootGroup = part.activeGroup;
		let rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

		let input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		let input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);

		// First editor opens in right group: Locked=true
		await rightGroup.openEditor(input1, { pinned: true });
		assert.strictEqual(rightGroup.isLocked, true);

		// Second editors opens in now unlocked right group: Locked=false
		rightGroup.lock(false);
		await rightGroup.openEditor(input2, { pinned: true });
		assert.strictEqual(rightGroup.isLocked, false);

		//First editor opens in root group without other groups being opened: Locked=false
		await rightGroup.closeAllEditors();
		part.removeGroup(rightGroup);
		await rootGroup.closeAllEditors();

		input1 = createTestFileEditorInput(URI.file('foo/bar1'), TEST_EDITOR_INPUT_ID);
		input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);

		await rootGroup.openEditor(input1, { pinned: true });
		assert.strictEqual(rootGroup.isLocked, false);
		rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
		assert.strictEqual(rootGroup.isLocked, false);
		const leftGroup = part.addGroup(rootGroup, GroupDirection.LEFT);
		assert.strictEqual(rootGroup.isLocked, false);
		part.removeGroup(leftGroup);
		assert.strictEqual(rootGroup.isLocked, false);
	});

	test('maximize editor group', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const [part] = await createPart(instantiationService);

		const rootGroup = part.activeGroup;
		const editorPartSize = part.getSize(rootGroup);

		// If there is only one group, it should not be considered maximized
		assert.strictEqual(part.hasMaximizedGroup(), false);

		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
		const rightBottomGroup = part.addGroup(rightGroup, GroupDirection.DOWN);

		const sizeRootGroup = part.getSize(rootGroup);
		const sizeRightGroup = part.getSize(rightGroup);
		const sizeRightBottomGroup = part.getSize(rightBottomGroup);

		let maximizedValue;
		const maxiizeGroupEventDisposable = part.onDidChangeGroupMaximized((maximized) => {
			maximizedValue = maximized;
		});

		assert.strictEqual(part.hasMaximizedGroup(), false);

		part.arrangeGroups(GroupsArrangement.MAXIMIZE, rootGroup);

		assert.strictEqual(part.hasMaximizedGroup(), true);

		// getSize()
		assert.deepStrictEqual(part.getSize(rootGroup), editorPartSize);
		assert.deepStrictEqual(part.getSize(rightGroup), { width: 0, height: 0 });
		assert.deepStrictEqual(part.getSize(rightBottomGroup), { width: 0, height: 0 });

		assert.deepStrictEqual(maximizedValue, true);

		part.toggleMaximizeGroup();

		assert.strictEqual(part.hasMaximizedGroup(), false);

		// Size is restored
		assert.deepStrictEqual(part.getSize(rootGroup), sizeRootGroup);
		assert.deepStrictEqual(part.getSize(rightGroup), sizeRightGroup);
		assert.deepStrictEqual(part.getSize(rightBottomGroup), sizeRightBottomGroup);

		assert.deepStrictEqual(maximizedValue, false);
		maxiizeGroupEventDisposable.dispose();
	});

	test('transient editors - basics', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputTransient = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);

		await group.openEditor(input, { pinned: true });
		await group.openEditor(inputTransient, { transient: true });

		assert.strictEqual(group.isTransient(input), false);
		assert.strictEqual(group.isTransient(inputTransient), true);

		await group.openEditor(input, { pinned: true });
		await group.openEditor(inputTransient, { transient: true });

		assert.strictEqual(group.isTransient(inputTransient), true);

		await group.openEditor(inputTransient, { transient: false });
		assert.strictEqual(group.isTransient(inputTransient), false);

		await group.openEditor(inputTransient, { transient: true });
		assert.strictEqual(group.isTransient(inputTransient), false); // cannot make a non-transient editor transient when already opened
	});

	test('transient editors - pinning clears transient', async () => {
		const [part] = await createPart();
		const group = part.activeGroup;

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const inputTransient = createTestFileEditorInput(URI.file('foo/bar/inactive'), TEST_EDITOR_INPUT_ID);

		await group.openEditor(input, { pinned: true });
		await group.openEditor(inputTransient, { transient: true });

		assert.strictEqual(group.isTransient(input), false);
		assert.strictEqual(group.isTransient(inputTransient), true);

		await group.openEditor(input, { pinned: true });
		await group.openEditor(inputTransient, { pinned: true, transient: true });

		assert.strictEqual(group.isTransient(inputTransient), false);
	});

	test('transient editors - overrides enablePreview setting', async function () {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration('workbench', { 'editor': { 'enablePreview': false } });
		instantiationService.stub(IConfigurationService, configurationService);

		const [part] = await createPart(instantiationService);

		const group = part.activeGroup;
		assert.strictEqual(group.isEmpty, true);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);

		await group.openEditor(input, { pinned: false });
		assert.strictEqual(group.isPinned(input), true);

		await group.openEditor(input2, { transient: true });
		assert.strictEqual(group.isPinned(input2), false);

		group.focus();
		assert.strictEqual(group.isPinned(input2), true);
	});

	test('working sets - create / apply state', async function () {
		const [part] = await createPart();

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);

		const pane1 = await part.activeGroup.openEditor(input, { pinned: true });
		const pane2 = await part.sideGroup.openEditor(input2, { pinned: true });

		const state = part.createState();

		await pane2?.group.closeAllEditors();
		await pane1?.group.closeAllEditors();

		assert.strictEqual(part.count, 1);
		assert.strictEqual(part.activeGroup.isEmpty, true);

		await part.applyState(state);

		assert.strictEqual(part.count, 2);

		assert.strictEqual(part.groups[0].contains(input), true);
		assert.strictEqual(part.groups[1].contains(input2), true);

		for (const group of part.groups) {
			await group.closeAllEditors();
		}

		const emptyState = part.createState();

		await part.applyState(emptyState);
		assert.strictEqual(part.count, 1);

		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);
		input3.dirty = true;
		await part.activeGroup.openEditor(input3, { pinned: true });

		await part.applyState(emptyState);

		assert.strictEqual(part.count, 1);
		assert.strictEqual(part.groups[0].contains(input3), true); // dirty editors enforce to be there even when state is empty

		await part.applyState('empty');

		assert.strictEqual(part.count, 1);
		assert.strictEqual(part.groups[0].contains(input3), true); // dirty editors enforce to be there even when state is empty

		input3.dirty = false;

		await part.applyState('empty');

		assert.strictEqual(part.count, 1);
		assert.strictEqual(part.activeGroup.isEmpty, true);
	});

	test('context key provider', async function () {
		const disposables = new DisposableStore();

		// Instantiate workbench and setup initial state
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		const rootContextKeyService = instantiationService.get(IContextKeyService);

		const [parts] = await createParts(instantiationService);

		const input1 = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.file('foo/bar3'), TEST_EDITOR_INPUT_ID);

		const group1 = parts.activeGroup;
		const group2 = parts.addGroup(group1, GroupDirection.RIGHT);

		await group2.openEditor(input2, { pinned: true });
		await group1.openEditor(input1, { pinned: true });

		// Create context key provider
		const rawContextKey = new RawContextKey<number>('testContextKey', parts.activeGroup.id);
		const contextKeyProvider: IEditorGroupContextKeyProvider<number> = {
			contextKey: rawContextKey,
			getGroupContextKeyValue: (group) => group.id
		};
		disposables.add(parts.registerContextKeyProvider(contextKeyProvider));

		// Initial state: group1 is active
		assert.strictEqual(parts.activeGroup.id, group1.id);

		let globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
		let group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
		let group2ContextKeyValue = group2.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
		assert.strictEqual(globalContextKeyValue, group1.id);
		assert.strictEqual(group1ContextKeyValue, group1.id);
		assert.strictEqual(group2ContextKeyValue, group2.id);

		// Make group2 active and ensure both gloabal and local context key values are updated
		parts.activateGroup(group2);

		globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
		group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
		group2ContextKeyValue = group2.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
		assert.strictEqual(globalContextKeyValue, group2.id);
		assert.strictEqual(group1ContextKeyValue, group1.id);
		assert.strictEqual(group2ContextKeyValue, group2.id);

		// Add a new group and ensure both gloabal and local context key values are updated
		// Group 3 will be active
		const group3 = parts.addGroup(group2, GroupDirection.RIGHT);
		await group3.openEditor(input3, { pinned: true });

		globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
		group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
		group2ContextKeyValue = group2.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
		const group3ContextKeyValue = group3.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
		assert.strictEqual(globalContextKeyValue, group3.id);
		assert.strictEqual(group1ContextKeyValue, group1.id);
		assert.strictEqual(group2ContextKeyValue, group2.id);
		assert.strictEqual(group3ContextKeyValue, group3.id);

		disposables.dispose();
	});

	test('context key provider: onDidChange', async function () {
		const disposables = new DisposableStore();

		// Instantiate workbench and setup initial state
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		const rootContextKeyService = instantiationService.get(IContextKeyService);

		const parts = await createEditorParts(instantiationService, disposables);

		const input1 = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);

		const group1 = parts.activeGroup;
		const group2 = parts.addGroup(group1, GroupDirection.RIGHT);

		await group2.openEditor(input2, { pinned: true });
		await group1.openEditor(input1, { pinned: true });

		// Create context key provider
		let offset = 0;
		const _onDidChange = new Emitter<void>();

		const rawContextKey = new RawContextKey<number>('testContextKey', parts.activeGroup.id);
		const contextKeyProvider: IEditorGroupContextKeyProvider<number> = {
			contextKey: rawContextKey,
			getGroupContextKeyValue: (group) => group.id + offset,
			onDidChange: _onDidChange.event
		};
		disposables.add(parts.registerContextKeyProvider(contextKeyProvider));

		// Initial state: group1 is active
		assert.strictEqual(parts.activeGroup.id, group1.id);

		let globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
		let group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
		let group2ContextKeyValue = group2.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
		assert.strictEqual(globalContextKeyValue, group1.id + offset);
		assert.strictEqual(group1ContextKeyValue, group1.id + offset);
		assert.strictEqual(group2ContextKeyValue, group2.id + offset);

		// Make a change to the context key provider and fire onDidChange such that all context key values are updated
		offset = 10;
		_onDidChange.fire();

		globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
		group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
		group2ContextKeyValue = group2.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
		assert.strictEqual(globalContextKeyValue, group1.id + offset);
		assert.strictEqual(group1ContextKeyValue, group1.id + offset);
		assert.strictEqual(group2ContextKeyValue, group2.id + offset);

		disposables.dispose();
	});

	test('context key provider: active editor change', async function () {
		const disposables = new DisposableStore();

		// Instantiate workbench and setup initial state
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		const rootContextKeyService = instantiationService.get(IContextKeyService);

		const parts = await createEditorParts(instantiationService, disposables);

		const input1 = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/bar2'), TEST_EDITOR_INPUT_ID);

		const group1 = parts.activeGroup;

		await group1.openEditor(input2, { pinned: true });
		await group1.openEditor(input1, { pinned: true });

		// Create context key provider
		const rawContextKey = new RawContextKey<string>('testContextKey', input1.resource.toString());
		const contextKeyProvider: IEditorGroupContextKeyProvider<string> = {
			contextKey: rawContextKey,
			getGroupContextKeyValue: (group) => group.activeEditor?.resource?.toString() ?? '',
		};
		disposables.add(parts.registerContextKeyProvider(contextKeyProvider));

		// Initial state: input1 is active
		assert.strictEqual(isEqual(group1.activeEditor?.resource, input1.resource), true);

		let globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
		let group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
		assert.strictEqual(globalContextKeyValue, input1.resource.toString());
		assert.strictEqual(group1ContextKeyValue, input1.resource.toString());

		// Make input2 active and ensure both gloabal and local context key values are updated
		await group1.openEditor(input2);

		globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
		group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
		assert.strictEqual(globalContextKeyValue, input2.resource.toString());
		assert.strictEqual(group1ContextKeyValue, input2.resource.toString());

		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
