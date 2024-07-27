/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { workbenchInstantiationService, TestServiceAccessor, registerTestEditor, registerTestFileEditor, registerTestResourceEditor, TestFileEditorInput, createEditorPart, registerTestSideBySideEditor, TestEditorInput } from 'vs/workbench/test/browser/workbenchTestServices';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { GroupDirection, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorService } from 'vs/workbench/services/editor/browser/editorService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { URI } from 'vs/base/common/uri';
import { resolveCommandsContext } from 'vs/workbench/browser/parts/editor/editorCommandsContext';
import { IEditorCommandsContext } from 'vs/workbench/common/editor';
import { IListService, WorkbenchListWidget } from 'vs/platform/list/browser/listService';

class TestListService implements IListService {
	declare readonly _serviceBrand: undefined;
	readonly lastFocusedList: WorkbenchListWidget | undefined = undefined;
}

suite('Resolving Editor Commands Context', () => {

	const disposables = new DisposableStore();

	const TEST_EDITOR_ID = 'MyTestEditorForEditors';

	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	const testListService = new TestListService();

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);

		disposables.add(accessor.untitledTextEditorService);
		disposables.add(registerTestFileEditor());
		disposables.add(registerTestSideBySideEditor());
		disposables.add(registerTestResourceEditor());
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput)]));
	});

	teardown(() => {
		disposables.clear();
	});

	let index = 0;
	function input(id = String(index++)): EditorInput {
		return disposables.add(new TestEditorInput(URI.parse(`file://${id}`), 'testInput'));
	}

	async function createServices(): Promise<TestServiceAccessor> {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);

		const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);

		return instantiationService.createInstance(TestServiceAccessor);
	}

	test('use editor group selection', async () => {
		const accessor = await createServices();
		const activeGroup = accessor.editorGroupService.activeGroup;

		const input1 = input();
		const input2 = input();
		const input3 = input();
		activeGroup.openEditor(input1, { pinned: true });
		activeGroup.openEditor(input2, { pinned: true });
		activeGroup.openEditor(input3, { pinned: true });

		activeGroup.setSelection(input1, [input2]);

		// use editor commands context
		const editorCommandContext: IEditorCommandsContext = { groupId: activeGroup.id, editorIndex: activeGroup.getIndexOfEditor(input1), preserveFocus: true };
		const resolvedContext1 = resolveCommandsContext([editorCommandContext], accessor.editorService, accessor.editorGroupService, testListService);

		assert.strictEqual(resolvedContext1.groupedEditors.length, 1);
		assert.strictEqual(resolvedContext1.groupedEditors[0].group.id, activeGroup.id);
		assert.strictEqual(resolvedContext1.groupedEditors[0].editors.length, 2);
		assert.strictEqual(resolvedContext1.groupedEditors[0].editors[0], input1);
		assert.strictEqual(resolvedContext1.groupedEditors[0].editors[1], input2);
		assert.strictEqual(resolvedContext1.preserveFocus, true);

		// use URI
		const resolvedContext2 = resolveCommandsContext([input2.resource], accessor.editorService, accessor.editorGroupService, testListService);

		assert.strictEqual(resolvedContext2.groupedEditors.length, 1);
		assert.strictEqual(resolvedContext2.groupedEditors[0].group.id, activeGroup.id);
		assert.strictEqual(resolvedContext2.groupedEditors[0].editors.length, 2);
		assert.strictEqual(resolvedContext2.groupedEditors[0].editors[0], input2);
		assert.strictEqual(resolvedContext2.groupedEditors[0].editors[1], input1);
		assert.strictEqual(resolvedContext2.preserveFocus, false);

		// use URI and commandContext
		const editor1CommandContext: IEditorCommandsContext = { groupId: activeGroup.id, editorIndex: activeGroup.getIndexOfEditor(input1), preserveFocus: true };
		const resolvedContext3 = resolveCommandsContext([editor1CommandContext], accessor.editorService, accessor.editorGroupService, testListService);

		assert.strictEqual(resolvedContext3.groupedEditors.length, 1);
		assert.strictEqual(resolvedContext3.groupedEditors[0].group.id, activeGroup.id);
		assert.strictEqual(resolvedContext3.groupedEditors[0].editors.length, 2);
		assert.strictEqual(resolvedContext3.groupedEditors[0].editors[0], input1);
		assert.strictEqual(resolvedContext3.groupedEditors[0].editors[1], input2);
		assert.strictEqual(resolvedContext3.preserveFocus, true);
	});

	test('don\'t use editor group selection', async () => {
		const accessor = await createServices();
		const activeGroup = accessor.editorGroupService.activeGroup;

		const input1 = input();
		const input2 = input();
		const input3 = input();
		activeGroup.openEditor(input1, { pinned: true });
		activeGroup.openEditor(input2, { pinned: true });
		activeGroup.openEditor(input3, { pinned: true });

		activeGroup.setSelection(input1, [input2]);

		// use editor commands context
		const editorCommandContext: IEditorCommandsContext = { groupId: activeGroup.id, editorIndex: activeGroup.getIndexOfEditor(input3), preserveFocus: true };
		const resolvedContext1 = resolveCommandsContext([editorCommandContext], accessor.editorService, accessor.editorGroupService, testListService);

		assert.strictEqual(resolvedContext1.groupedEditors.length, 1);
		assert.strictEqual(resolvedContext1.groupedEditors[0].group.id, activeGroup.id);
		assert.strictEqual(resolvedContext1.groupedEditors[0].editors.length, 1);
		assert.strictEqual(resolvedContext1.groupedEditors[0].editors[0], input3);
		assert.strictEqual(resolvedContext1.preserveFocus, true);

		// use URI
		const resolvedContext2 = resolveCommandsContext([input3.resource], accessor.editorService, accessor.editorGroupService, testListService);

		assert.strictEqual(resolvedContext2.groupedEditors.length, 1);
		assert.strictEqual(resolvedContext2.groupedEditors[0].group.id, activeGroup.id);
		assert.strictEqual(resolvedContext2.groupedEditors[0].editors.length, 1);
		assert.strictEqual(resolvedContext2.groupedEditors[0].editors[0], input3);
		assert.strictEqual(resolvedContext2.preserveFocus, false);
	});

	test('inactive edior group command context', async () => {
		const accessor = await createServices();
		const editorGroupService = accessor.editorGroupService;

		const group1 = editorGroupService.activeGroup;
		const group2 = editorGroupService.addGroup(group1, GroupDirection.RIGHT);

		const input11 = input();
		const input12 = input();
		group1.openEditor(input11, { pinned: true });
		group1.openEditor(input12, { pinned: true });

		const input21 = input();
		group2.openEditor(input21, { pinned: true });

		editorGroupService.activateGroup(group1);
		group1.setSelection(input11, [input12]);

		// use editor commands context of inactive group with editor index
		const editorCommandContext1: IEditorCommandsContext = { groupId: group2.id, editorIndex: group2.getIndexOfEditor(input21), preserveFocus: true };
		const resolvedContext1 = resolveCommandsContext([editorCommandContext1], accessor.editorService, accessor.editorGroupService, testListService);

		assert.strictEqual(resolvedContext1.groupedEditors.length, 1);
		assert.strictEqual(resolvedContext1.groupedEditors[0].group.id, group2.id);
		assert.strictEqual(resolvedContext1.groupedEditors[0].editors.length, 1);
		assert.strictEqual(resolvedContext1.groupedEditors[0].editors[0], input21);
		assert.strictEqual(resolvedContext1.preserveFocus, true);

		// use editor commands context of inactive group without editor index
		const editorCommandContext2: IEditorCommandsContext = { groupId: group2.id, preserveFocus: true };
		const resolvedContext2 = resolveCommandsContext([editorCommandContext2], accessor.editorService, accessor.editorGroupService, testListService);

		assert.strictEqual(resolvedContext2.groupedEditors.length, 1);
		assert.strictEqual(resolvedContext2.groupedEditors[0].group.id, group2.id);
		assert.strictEqual(resolvedContext2.groupedEditors[0].editors.length, 1);
		assert.strictEqual(resolvedContext1.groupedEditors[0].editors[0], input21);
		assert.strictEqual(resolvedContext2.preserveFocus, true);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
