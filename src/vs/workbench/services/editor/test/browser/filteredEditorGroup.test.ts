/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { EditorsOrder } from 'vs/workbench/common/editor';
import { workbenchInstantiationService, TestServiceAccessor, registerTestEditor, TestFileEditorInput, ITestInstantiationService, registerTestResourceEditor, registerTestSideBySideEditor, createEditorPart, TestSingletonFileEditorInput, workbenchTeardown } from 'vs/workbench/test/browser/workbenchTestServices';
import { EditorService } from 'vs/workbench/services/editor/browser/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { StickyEditorGroupModel, UnstickyEditorGroupModel } from 'vs/workbench/services/editor/common/filteredEditorGroup';

suite('FilteredEditorGroupModel', () => {

	const TEST_EDITOR_ID = 'MyTestEditorForFilteredEditorGroupModel';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForFilteredEditorGroupModel';

	const disposables = new DisposableStore();

	let testLocalInstantiationService: ITestInstantiationService | undefined = undefined;

	setup(() => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(TestSingletonFileEditorInput)], TEST_EDITOR_INPUT_ID));
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

	async function createEditorService(instantiationService: ITestInstantiationService = workbenchInstantiationService(undefined, disposables)): Promise<[EditorPart, EditorService, TestServiceAccessor]> {
		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);

		const editorService = disposables.add(instantiationService.createInstance(EditorService));
		instantiationService.stub(IEditorService, editorService);

		testLocalInstantiationService = instantiationService;

		return [part, editorService, instantiationService.createInstance(TestServiceAccessor)];
	}

	function createTestFileEditorInput(resource: URI, typeId: string): TestFileEditorInput {
		return disposables.add(new TestFileEditorInput(resource, typeId));
	}

	test('Sticky/Unsticky count', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true, sticky: true });
		await service.openEditor(input2, { pinned: true, sticky: true });


		assert.strictEqual(stickyFilteredEditorGroup.count, 2);
		assert.strictEqual(unstickyFilteredEditorGroup.count, 0);

		rootGroup.unstickEditor(input1);

		assert.strictEqual(stickyFilteredEditorGroup.count, 1);
		assert.strictEqual(unstickyFilteredEditorGroup.count, 1);

		rootGroup.unstickEditor(input2);

		assert.strictEqual(stickyFilteredEditorGroup.count, 0);
		assert.strictEqual(unstickyFilteredEditorGroup.count, 2);
	});

	test('Sticky/Unsticky stickyCount', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true, sticky: true });
		await service.openEditor(input2, { pinned: true, sticky: true });


		assert.strictEqual(stickyFilteredEditorGroup.stickyCount, 2);
		assert.strictEqual(unstickyFilteredEditorGroup.stickyCount, 0);

		rootGroup.unstickEditor(input1);

		assert.strictEqual(stickyFilteredEditorGroup.stickyCount, 1);
		assert.strictEqual(unstickyFilteredEditorGroup.stickyCount, 0);

		rootGroup.unstickEditor(input2);

		assert.strictEqual(stickyFilteredEditorGroup.stickyCount, 0);
		assert.strictEqual(unstickyFilteredEditorGroup.stickyCount, 0);
	});

	test('Sticky/Unsticky isEmpty', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true, sticky: false });
		await service.openEditor(input2, { pinned: true, sticky: false });


		assert.strictEqual(stickyFilteredEditorGroup.isEmpty, true);
		assert.strictEqual(unstickyFilteredEditorGroup.isEmpty, false);

		rootGroup.stickEditor(input1);

		assert.strictEqual(stickyFilteredEditorGroup.isEmpty, false);
		assert.strictEqual(unstickyFilteredEditorGroup.isEmpty, false);

		rootGroup.stickEditor(input2);

		assert.strictEqual(stickyFilteredEditorGroup.isEmpty, false);
		assert.strictEqual(unstickyFilteredEditorGroup.isEmpty, true);
	});

	test('Sticky/Unsticky editors', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true, sticky: true });
		await service.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.editors.length, 2);
		assert.strictEqual(unstickyFilteredEditorGroup.editors.length, 0);

		rootGroup.unstickEditor(input1);

		assert.strictEqual(stickyFilteredEditorGroup.editors.length, 1);
		assert.strictEqual(unstickyFilteredEditorGroup.editors.length, 1);

		assert.strictEqual(stickyFilteredEditorGroup.editors[0], input2);
		assert.strictEqual(unstickyFilteredEditorGroup.editors[0], input1);

		rootGroup.unstickEditor(input2);

		assert.strictEqual(stickyFilteredEditorGroup.editors.length, 0);
		assert.strictEqual(unstickyFilteredEditorGroup.editors.length, 2);
	});

	test('Sticky/Unsticky activeEditor', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.activeEditor, input1);
		assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, null);

		await service.openEditor(input2, { pinned: true, sticky: false });

		assert.strictEqual(stickyFilteredEditorGroup.activeEditor, null);
		assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, input2);

		await service.closeEditor({ editor: input1, groupId: rootGroup.id });

		assert.strictEqual(stickyFilteredEditorGroup.activeEditor, null);
		assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, input2);

		await service.closeEditor({ editor: input2, groupId: rootGroup.id });

		assert.strictEqual(stickyFilteredEditorGroup.activeEditor, null);
		assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, null);
	});

	test('Sticky/Unsticky activeEditorPane', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);

		const pane1 = await service.openEditor(input1, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.activeEditorPane, pane1);
		assert.strictEqual(unstickyFilteredEditorGroup.activeEditorPane, undefined);

		const pane2 = await service.openEditor(input2, { pinned: true, sticky: false });

		assert.strictEqual(stickyFilteredEditorGroup.activeEditorPane, undefined);
		assert.strictEqual(unstickyFilteredEditorGroup.activeEditorPane, pane2);

		await service.closeEditor({ editor: input1, groupId: rootGroup.id });

		assert.strictEqual(stickyFilteredEditorGroup.activeEditorPane, undefined);
		assert.strictEqual(unstickyFilteredEditorGroup.activeEditorPane, pane2);

		await service.closeEditor({ editor: input2, groupId: rootGroup.id });

		assert.strictEqual(stickyFilteredEditorGroup.activeEditorPane, undefined);
		assert.strictEqual(unstickyFilteredEditorGroup.activeEditorPane, undefined);
	});

	test('Sticky/Unsticky previewEditor', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1);

		assert.strictEqual(stickyFilteredEditorGroup.previewEditor, null);
		assert.strictEqual(unstickyFilteredEditorGroup.previewEditor, input1);

		await service.openEditor(input2, { sticky: true });
		assert.strictEqual(stickyFilteredEditorGroup.previewEditor, null);
		assert.strictEqual(unstickyFilteredEditorGroup.previewEditor, input1);
	});

	test('Sticky/Unsticky isSticky()', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true, sticky: true });
		await service.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.isSticky(input1), true);
		assert.strictEqual(stickyFilteredEditorGroup.isSticky(input2), true);

		rootGroup.unstickEditor(input1);
		await service.closeEditor({ editor: input1, groupId: rootGroup.id });
		await service.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(unstickyFilteredEditorGroup.isSticky(input1), false);
		assert.strictEqual(unstickyFilteredEditorGroup.isSticky(input2), false);
	});

	test('Sticky/Unsticky isPinned()', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup3'), TEST_EDITOR_INPUT_ID);
		const input4 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup4'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true, sticky: true });
		await service.openEditor(input2, { pinned: true, sticky: false });
		await service.openEditor(input3, { pinned: false, sticky: true });
		await service.openEditor(input4, { pinned: false, sticky: false });

		assert.strictEqual(stickyFilteredEditorGroup.isPinned(input1), true);
		assert.strictEqual(unstickyFilteredEditorGroup.isPinned(input2), true);
		assert.strictEqual(stickyFilteredEditorGroup.isPinned(input3), true);
		assert.strictEqual(unstickyFilteredEditorGroup.isPinned(input4), false);
	});

	test('Sticky/Unsticky isActive()', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.isActive(input1), true);

		await service.openEditor(input2, { pinned: true, sticky: false });

		assert.strictEqual(stickyFilteredEditorGroup.isActive(input1), false);
		assert.strictEqual(unstickyFilteredEditorGroup.isActive(input2), true);

		rootGroup.unstickEditor(input1);

		assert.strictEqual(unstickyFilteredEditorGroup.isActive(input1), false);
		assert.strictEqual(unstickyFilteredEditorGroup.isActive(input2), true);
	});

	test('Sticky/Unsticky getEditors()', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true, sticky: true });
		await service.openEditor(input2, { pinned: true, sticky: true });

		// all sticky editors
		assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
		assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);

		// no unsticky editors
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);

		// options: excludeSticky
		assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 0);
		assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: false }).length, 2);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 0);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: false }).length, 0);

		rootGroup.unstickEditor(input1);

		assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 1);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 1);

		assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0], input2);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL)[0], input1);

		rootGroup.unstickEditor(input2);

		// all unsticky editors
		assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);

		// order: MOST_RECENTLY_ACTIVE
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0], input2);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1], input1);

		// order: SEQUENTIAL
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL)[0], input2);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL)[1], input1);
	});

	test('Sticky/Unsticky findEditors()', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const uri1 = URI.parse('my://resource-filteredEditorGroup1');
		const uri2 = URI.parse('my://resource-filteredEditorGroup2');

		const input1 = createTestFileEditorInput(uri1, TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(uri2, TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true, sticky: true });
		await service.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.findEditors(uri1).length, 1);
		assert.strictEqual(stickyFilteredEditorGroup.findEditors(uri2).length, 1);

		assert.strictEqual(stickyFilteredEditorGroup.findEditors(uri1)[0], input1);
		assert.strictEqual(stickyFilteredEditorGroup.findEditors(uri2)[0], input2);

		assert.strictEqual(unstickyFilteredEditorGroup.findEditors(uri1).length, 0);
		assert.strictEqual(unstickyFilteredEditorGroup.findEditors(uri2).length, 0);

		rootGroup.unstickEditor(input1);

		assert.strictEqual(stickyFilteredEditorGroup.findEditors(uri1).length, 0);
		assert.strictEqual(stickyFilteredEditorGroup.findEditors(uri2).length, 1);

		assert.strictEqual(stickyFilteredEditorGroup.findEditors(uri2)[0], input2);

		assert.strictEqual(unstickyFilteredEditorGroup.findEditors(uri1).length, 1);
		assert.strictEqual(unstickyFilteredEditorGroup.findEditors(uri2).length, 0);

		assert.strictEqual(unstickyFilteredEditorGroup.findEditors(uri1)[0], input1);

		rootGroup.unstickEditor(input2);

		assert.strictEqual(stickyFilteredEditorGroup.findEditors(uri1).length, 0);
		assert.strictEqual(stickyFilteredEditorGroup.findEditors(uri2).length, 0);


		assert.strictEqual(unstickyFilteredEditorGroup.findEditors(uri1).length, 1);
		assert.strictEqual(unstickyFilteredEditorGroup.findEditors(uri2).length, 1);

		assert.strictEqual(unstickyFilteredEditorGroup.findEditors(uri1)[0], input1);
		assert.strictEqual(unstickyFilteredEditorGroup.findEditors(uri2)[0], input2);
	});

	test('Sticky/Unsticky getEditorByIndex()', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup3'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true, sticky: true });
		await service.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(0), input1);
		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(1), input2);
		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(2), undefined);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(0), undefined);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(1), undefined);

		await service.openEditor(input3, { pinned: true, sticky: false });

		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(0), input1);
		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(1), input2);
		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(2), undefined);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(0), input3);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(1), undefined);

		rootGroup.unstickEditor(input1);

		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(0), input2);
		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(1), undefined);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(0), input1);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(1), input3);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(2), undefined);
	});

	test('Sticky/Unsticky getIndexOfEditor()', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);
		const input3 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup3'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true, sticky: true });
		await service.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.getIndexOfEditor(input1), 0);
		assert.strictEqual(stickyFilteredEditorGroup.getIndexOfEditor(input2), 1);
		assert.strictEqual(unstickyFilteredEditorGroup.getIndexOfEditor(input1), -1);
		assert.strictEqual(unstickyFilteredEditorGroup.getIndexOfEditor(input2), -1);

		await service.openEditor(input3, { pinned: true, sticky: false });

		assert.strictEqual(stickyFilteredEditorGroup.getIndexOfEditor(input1), 0);
		assert.strictEqual(stickyFilteredEditorGroup.getIndexOfEditor(input2), 1);
		assert.strictEqual(stickyFilteredEditorGroup.getIndexOfEditor(input3), -1);
		assert.strictEqual(unstickyFilteredEditorGroup.getIndexOfEditor(input1), -1);
		assert.strictEqual(unstickyFilteredEditorGroup.getIndexOfEditor(input2), -1);
		assert.strictEqual(unstickyFilteredEditorGroup.getIndexOfEditor(input3), 0);

		rootGroup.unstickEditor(input1);

		assert.strictEqual(stickyFilteredEditorGroup.getIndexOfEditor(input1), -1);
		assert.strictEqual(stickyFilteredEditorGroup.getIndexOfEditor(input2), 0);
		assert.strictEqual(stickyFilteredEditorGroup.getIndexOfEditor(input3), -1);
		assert.strictEqual(unstickyFilteredEditorGroup.getIndexOfEditor(input1), 0);
		assert.strictEqual(unstickyFilteredEditorGroup.getIndexOfEditor(input2), -1);
		assert.strictEqual(unstickyFilteredEditorGroup.getIndexOfEditor(input3), 1);
	});

	test('Sticky/Unsticky isFirst()', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.isFirst(input1), true);

		await service.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.isFirst(input1), true);
		assert.strictEqual(stickyFilteredEditorGroup.isFirst(input2), false);

		rootGroup.unstickEditor(input1);

		assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input1), true);
		assert.strictEqual(stickyFilteredEditorGroup.isFirst(input2), true);

		rootGroup.unstickEditor(input2);

		assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input1), false);
		assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input2), true);

		rootGroup.moveEditor(input2, rootGroup, { index: 1 });

		assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input1), true);
		assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input2), false);
	});

	test('Sticky/Unsticky isLast()', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.isLast(input1), true);

		await service.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.isLast(input1), false);
		assert.strictEqual(stickyFilteredEditorGroup.isLast(input2), true);

		rootGroup.unstickEditor(input1);

		assert.strictEqual(unstickyFilteredEditorGroup.isLast(input1), true);
		assert.strictEqual(stickyFilteredEditorGroup.isLast(input2), true);

		rootGroup.unstickEditor(input2);

		assert.strictEqual(unstickyFilteredEditorGroup.isLast(input1), true);
		assert.strictEqual(unstickyFilteredEditorGroup.isLast(input2), false);

		rootGroup.moveEditor(input2, rootGroup, { index: 1 });

		assert.strictEqual(unstickyFilteredEditorGroup.isLast(input1), false);
		assert.strictEqual(unstickyFilteredEditorGroup.isLast(input2), true);
	});

	test('Sticky/Unsticky contains()', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		const input1 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup1'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.parse('my://resource-filteredEditorGroup2'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true, sticky: true });
		await service.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.contains(input1), true);
		assert.strictEqual(stickyFilteredEditorGroup.contains(input2), true);

		assert.strictEqual(unstickyFilteredEditorGroup.contains(input1), false);
		assert.strictEqual(unstickyFilteredEditorGroup.contains(input2), false);

		rootGroup.unstickEditor(input1);

		assert.strictEqual(stickyFilteredEditorGroup.contains(input1), false);
		assert.strictEqual(stickyFilteredEditorGroup.contains(input2), true);

		assert.strictEqual(unstickyFilteredEditorGroup.contains(input1), true);
		assert.strictEqual(unstickyFilteredEditorGroup.contains(input2), false);

		rootGroup.unstickEditor(input2);

		assert.strictEqual(stickyFilteredEditorGroup.contains(input1), false);
		assert.strictEqual(stickyFilteredEditorGroup.contains(input2), false);

		assert.strictEqual(unstickyFilteredEditorGroup.contains(input1), true);
		assert.strictEqual(unstickyFilteredEditorGroup.contains(input2), true);
	});

	test('Sticky/Unsticky group information', async () => {
		const [part] = await createEditorService();

		const rootGroup = part.activeGroup;

		const stickyFilteredEditorGroup = new StickyEditorGroupModel(rootGroup);
		const unstickyFilteredEditorGroup = new UnstickyEditorGroupModel(rootGroup);

		// same id
		assert.strictEqual(stickyFilteredEditorGroup.id, rootGroup.id);
		assert.strictEqual(unstickyFilteredEditorGroup.id, rootGroup.id);

		// same index
		assert.strictEqual(stickyFilteredEditorGroup.index, rootGroup.index);
		assert.strictEqual(unstickyFilteredEditorGroup.index, rootGroup.index);

		// same label
		assert.strictEqual(stickyFilteredEditorGroup.label, rootGroup.label);
		assert.strictEqual(unstickyFilteredEditorGroup.label, rootGroup.label);

		// same ariaLabel
		assert.strictEqual(stickyFilteredEditorGroup.ariaLabel, rootGroup.ariaLabel);
		assert.strictEqual(unstickyFilteredEditorGroup.ariaLabel, rootGroup.ariaLabel);

		// same ariaLabel
		assert.strictEqual(stickyFilteredEditorGroup.scopedContextKeyService, rootGroup.scopedContextKeyService);
		assert.strictEqual(unstickyFilteredEditorGroup.scopedContextKeyService, rootGroup.scopedContextKeyService);

		// group locking same behaviour
		assert.strictEqual(stickyFilteredEditorGroup.isLocked, rootGroup.isLocked);
		assert.strictEqual(unstickyFilteredEditorGroup.isLocked, rootGroup.isLocked);

		rootGroup.lock(true);

		assert.strictEqual(stickyFilteredEditorGroup.isLocked, rootGroup.isLocked);
		assert.strictEqual(unstickyFilteredEditorGroup.isLocked, rootGroup.isLocked);

		rootGroup.lock(false);

		assert.strictEqual(stickyFilteredEditorGroup.isLocked, rootGroup.isLocked);
		assert.strictEqual(unstickyFilteredEditorGroup.isLocked, rootGroup.isLocked);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
