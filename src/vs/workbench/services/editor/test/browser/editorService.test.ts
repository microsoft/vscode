/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EditorActivation, EditorResolution, IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { DEFAULT_EDITOR_ASSOCIATION, EditorsOrder, IEditorInputWithOptions, IEditorPane, IResourceDiffEditorInput, isEditorInputWithOptions, IUntitledTextResourceEditorInput, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { workbenchInstantiationService, TestServiceAccessor, registerTestEditor, TestFileEditorInput, ITestInstantiationService, registerTestResourceEditor, registerTestSideBySideEditor, createEditorPart, registerTestFileEditor, TestEditorWithOptions, TestTextFileEditor } from 'vs/workbench/test/browser/workbenchTestServices';
import { EditorService } from 'vs/workbench/services/editor/browser/editorService';
import { IEditorGroup, IEditorGroupsService, GroupDirection, GroupsArrangement } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { ACTIVE_GROUP, IEditorService, PreferredGroup, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { FileEditorInput } from 'vs/workbench/contrib/files/browser/editors/fileEditorInput';
import { timeout } from 'vs/base/common/async';
import { FileOperationEvent, FileOperation } from 'vs/platform/files/common/files';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { MockScopableContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { IWorkspaceTrustRequestService, WorkspaceTrustUriResponse } from 'vs/platform/workspace/common/workspaceTrust';
import { TestWorkspaceTrustRequestService } from 'vs/workbench/services/workspaces/test/common/testWorkspaceTrustService';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { UnknownErrorEditor } from 'vs/workbench/browser/parts/editor/editorPlaceholder';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

suite('EditorService', () => {

	const TEST_EDITOR_ID = 'MyTestEditorForEditorService';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForEditorService';

	const disposables = new DisposableStore();

	setup(() => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput)], TEST_EDITOR_INPUT_ID));
		disposables.add(registerTestResourceEditor());
		disposables.add(registerTestSideBySideEditor());
	});

	teardown(() => {
		disposables.clear();
	});

	async function createEditorService(instantiationService: ITestInstantiationService = workbenchInstantiationService()): Promise<[EditorPart, EditorService, TestServiceAccessor]> {
		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);

		instantiationService.stub(IWorkspaceTrustRequestService, new TestWorkspaceTrustRequestService(false));

		const editorService = instantiationService.createInstance(EditorService);
		instantiationService.stub(IEditorService, editorService);

		return [part, editorService, instantiationService.createInstance(TestServiceAccessor)];
	}

	test('openEditor() - basics', async () => {
		const [, service] = await createEditorService();

		let input = new TestFileEditorInput(URI.parse('my://resource-basics'), TEST_EDITOR_INPUT_ID);
		let otherInput = new TestFileEditorInput(URI.parse('my://resource2-basics'), TEST_EDITOR_INPUT_ID);

		let activeEditorChangeEventCounter = 0;
		const activeEditorChangeListener = service.onDidActiveEditorChange(() => {
			activeEditorChangeEventCounter++;
		});

		let visibleEditorChangeEventCounter = 0;
		const visibleEditorChangeListener = service.onDidVisibleEditorsChange(() => {
			visibleEditorChangeEventCounter++;
		});

		let didCloseEditorListenerCounter = 0;
		const didCloseEditorListener = service.onDidCloseEditor(() => {
			didCloseEditorListenerCounter++;
		});

		// Open input
		let editor = await service.openEditor(input, { pinned: true });

		assert.strictEqual(editor?.getId(), TEST_EDITOR_ID);
		assert.strictEqual(editor, service.activeEditorPane);
		assert.strictEqual(1, service.count);
		assert.strictEqual(input, service.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].editor);
		assert.strictEqual(input, service.getEditors(EditorsOrder.SEQUENTIAL)[0].editor);
		assert.strictEqual(input, service.activeEditor);
		assert.strictEqual(service.visibleEditorPanes.length, 1);
		assert.strictEqual(service.visibleEditorPanes[0], editor);
		assert.ok(!service.activeTextEditorControl);
		assert.ok(!service.activeTextEditorMode);
		assert.strictEqual(service.visibleTextEditorControls.length, 0);
		assert.strictEqual(service.isOpened(input), true);
		assert.strictEqual(service.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), true);
		assert.strictEqual(service.isOpened({ resource: input.resource, typeId: input.typeId, editorId: 'unknownTypeId' }), false);
		assert.strictEqual(service.isOpened({ resource: input.resource, typeId: 'unknownTypeId', editorId: input.editorId }), false);
		assert.strictEqual(service.isOpened({ resource: input.resource, typeId: 'unknownTypeId', editorId: 'unknownTypeId' }), false);
		assert.strictEqual(service.isVisible(input), true);
		assert.strictEqual(service.isVisible(otherInput), false);
		assert.strictEqual(activeEditorChangeEventCounter, 1);
		assert.strictEqual(visibleEditorChangeEventCounter, 1);

		// Close input
		await editor?.group?.closeEditor(input);

		assert.strictEqual(0, service.count);
		assert.strictEqual(0, service.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length);
		assert.strictEqual(0, service.getEditors(EditorsOrder.SEQUENTIAL).length);
		assert.strictEqual(didCloseEditorListenerCounter, 1);
		assert.strictEqual(activeEditorChangeEventCounter, 2);
		assert.strictEqual(visibleEditorChangeEventCounter, 2);
		assert.ok(input.gotDisposed);

		// Open again 2 inputs (disposed editors are ignored!)
		await service.openEditor(input, { pinned: true });
		assert.strictEqual(0, service.count);

		// Open again 2 inputs (recreate because disposed)
		input = new TestFileEditorInput(URI.parse('my://resource-basics'), TEST_EDITOR_INPUT_ID);
		otherInput = new TestFileEditorInput(URI.parse('my://resource2-basics'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input, { pinned: true });
		editor = await service.openEditor(otherInput, { pinned: true });

		assert.strictEqual(2, service.count);
		assert.strictEqual(otherInput, service.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].editor);
		assert.strictEqual(input, service.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].editor);
		assert.strictEqual(input, service.getEditors(EditorsOrder.SEQUENTIAL)[0].editor);
		assert.strictEqual(otherInput, service.getEditors(EditorsOrder.SEQUENTIAL)[1].editor);
		assert.strictEqual(service.visibleEditorPanes.length, 1);
		assert.strictEqual(service.isOpened(input), true);
		assert.strictEqual(service.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), true);
		assert.strictEqual(service.isOpened(otherInput), true);
		assert.strictEqual(service.isOpened({ resource: otherInput.resource, typeId: otherInput.typeId, editorId: otherInput.editorId }), true);

		assert.strictEqual(activeEditorChangeEventCounter, 4);
		assert.strictEqual(visibleEditorChangeEventCounter, 4);

		const stickyInput = new TestFileEditorInput(URI.parse('my://resource3-basics'), TEST_EDITOR_INPUT_ID);
		await service.openEditor(stickyInput, { sticky: true });

		assert.strictEqual(3, service.count);

		const allSequentialEditors = service.getEditors(EditorsOrder.SEQUENTIAL);
		assert.strictEqual(allSequentialEditors.length, 3);
		assert.strictEqual(stickyInput, allSequentialEditors[0].editor);
		assert.strictEqual(input, allSequentialEditors[1].editor);
		assert.strictEqual(otherInput, allSequentialEditors[2].editor);

		const sequentialEditorsExcludingSticky = service.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true });
		assert.strictEqual(sequentialEditorsExcludingSticky.length, 2);
		assert.strictEqual(input, sequentialEditorsExcludingSticky[0].editor);
		assert.strictEqual(otherInput, sequentialEditorsExcludingSticky[1].editor);

		const mruEditorsExcludingSticky = service.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true });
		assert.strictEqual(mruEditorsExcludingSticky.length, 2);
		assert.strictEqual(input, sequentialEditorsExcludingSticky[0].editor);
		assert.strictEqual(otherInput, sequentialEditorsExcludingSticky[1].editor);

		activeEditorChangeListener.dispose();
		visibleEditorChangeListener.dispose();
		didCloseEditorListener.dispose();
	});

	test('openEditor() - locked groups', async () => {
		disposables.add(registerTestFileEditor());

		const [part, service, accessor] = await createEditorService();

		disposables.add(accessor.editorResolverService.registerEditor(
			'*.editor-service-locked-group-tests',
			{ id: TEST_EDITOR_INPUT_ID, label: 'Label', priority: RegisteredEditorPriority.exclusive },
			{},
			editor => ({ editor: new TestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
		));

		let input1: IResourceEditorInput = { resource: URI.parse('file://resource-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		let input2: IResourceEditorInput = { resource: URI.parse('file://resource2-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		let input3: IResourceEditorInput = { resource: URI.parse('file://resource3-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		let input4: IResourceEditorInput = { resource: URI.parse('file://resource4-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		let input5: IResourceEditorInput = { resource: URI.parse('file://resource5-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		let input6: IResourceEditorInput = { resource: URI.parse('file://resource6-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		let input7: IResourceEditorInput = { resource: URI.parse('file://resource7-basics.editor-service-locked-group-tests'), options: { pinned: true } };

		let editor1 = await service.openEditor(input1, { pinned: true });
		let editor2 = await service.openEditor(input2, { pinned: true }, SIDE_GROUP);

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
		let editor3 = await service.openEditor(input4, { pinned: true }, SIDE_GROUP);
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
		let editor5 = await service.openEditor(input5, { pinned: true });
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
		const instantiationService = workbenchInstantiationService();
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration('workbench', { 'editor': { 'revealIfOpen': true } });
		instantiationService.stub(IConfigurationService, configurationService);

		disposables.add(registerTestFileEditor());

		const [part, service, accessor] = await createEditorService(instantiationService);

		disposables.add(accessor.editorResolverService.registerEditor(
			'*.editor-service-locked-group-tests',
			{ id: TEST_EDITOR_INPUT_ID, label: 'Label', priority: RegisteredEditorPriority.exclusive },
			{},
			editor => ({ editor: new TestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
		));

		const rootGroup = part.activeGroup;
		let rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

		part.activateGroup(rootGroup);

		let input1: IResourceEditorInput = { resource: URI.parse('file://resource-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		let input2: IResourceEditorInput = { resource: URI.parse('file://resource2-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		let input3: IResourceEditorInput = { resource: URI.parse('file://resource3-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		let input4: IResourceEditorInput = { resource: URI.parse('file://resource4-basics.editor-service-locked-group-tests'), options: { pinned: true } };

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

		disposables.add(accessor.editorResolverService.registerEditor(
			'*.editor-service-locked-group-tests',
			{ id: TEST_EDITOR_INPUT_ID, label: 'Label', priority: RegisteredEditorPriority.exclusive },
			{},
			editor => ({ editor: new TestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
		));

		const rootGroup = part.activeGroup;
		let rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

		part.activateGroup(rootGroup);

		let input1: IResourceEditorInput = { resource: URI.parse('file://resource-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		let input2: IResourceEditorInput = { resource: URI.parse('file://resource2-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		let input3: IResourceEditorInput = { resource: URI.parse('file://resource3-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		let input4: IResourceEditorInput = { resource: URI.parse('file://resource4-basics.editor-service-locked-group-tests'), options: { pinned: true } };

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

		disposables.add(accessor.editorResolverService.registerEditor(
			'*.editor-service-locked-group-tests',
			{ id: TEST_EDITOR_INPUT_ID, label: 'Label', priority: RegisteredEditorPriority.exclusive },
			{},
			editor => ({ editor: new TestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
		));

		const rootGroup = part.activeGroup;
		let rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

		part.activateGroup(rootGroup);

		let input1: IResourceEditorInput = { resource: URI.parse('file://resource-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		let input2: IResourceEditorInput = { resource: URI.parse('file://resource2-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		let input3: IResourceEditorInput = { resource: URI.parse('file://resource3-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		let input4: IResourceEditorInput = { resource: URI.parse('file://resource4-basics.editor-service-locked-group-tests'), options: { pinned: true } };

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

	async function testOpenEditors(useOpenEditors: boolean) {
		disposables.add(registerTestFileEditor());

		const [part, service, accessor] = await createEditorService();

		let rootGroup = part.activeGroup;

		let editorFactoryCalled = 0;
		let untitledEditorFactoryCalled = 0;
		let diffEditorFactoryCalled = 0;

		let lastEditorFactoryEditor: IResourceEditorInput | undefined = undefined;
		let lastUntitledEditorFactoryEditor: IUntitledTextResourceEditorInput | undefined = undefined;
		let lastDiffEditorFactoryEditor: IResourceDiffEditorInput | undefined = undefined;

		disposables.add(accessor.editorResolverService.registerEditor(
			'*.editor-service-override-tests',
			{ id: TEST_EDITOR_INPUT_ID, label: 'Label', priority: RegisteredEditorPriority.exclusive },
			{ canHandleDiff: true },
			editor => {
				editorFactoryCalled++;
				lastEditorFactoryEditor = editor;

				return { editor: new TestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) };
			},
			untitledEditor => {
				untitledEditorFactoryCalled++;
				lastUntitledEditorFactoryEditor = untitledEditor;

				return { editor: new TestFileEditorInput(untitledEditor.resource ?? URI.parse(`untitled://my-untitled-editor-${untitledEditorFactoryCalled}`), TEST_EDITOR_INPUT_ID) };
			},
			diffEditor => {
				diffEditorFactoryCalled++;
				lastDiffEditorFactoryEditor = diffEditor;

				return { editor: new TestFileEditorInput(URI.file(`diff-editor-${diffEditorFactoryCalled}`), TEST_EDITOR_INPUT_ID) };
			}
		));

		async function resetTestState() {
			editorFactoryCalled = 0;
			untitledEditorFactoryCalled = 0;
			diffEditorFactoryCalled = 0;

			lastEditorFactoryEditor = undefined;
			lastUntitledEditorFactoryEditor = undefined;
			lastDiffEditorFactoryEditor = undefined;

			for (const group of part.groups) {
				await group.closeAllEditors();
			}

			for (const group of part.groups) {
				accessor.editorGroupService.removeGroup(group);
			}

			rootGroup = part.activeGroup;
		}

		async function openEditor(editor: IEditorInputWithOptions | IUntypedEditorInput, group?: PreferredGroup): Promise<IEditorPane | undefined> {
			if (useOpenEditors) {
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
				let untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests') };
				let pane = await openEditor(untypedEditor);
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
				let untypedEditorReplacement: IResourceEditorInput = { resource: URI.file('file-replaced.editor-service-override-tests') };
				await service.replaceEditors([{
					editor: typedEditor,
					replacement: untypedEditorReplacement
				}], rootGroup);

				typedEditor = rootGroup.activeEditor!;

				assert.ok(typedEditor instanceof TestFileEditorInput);
				assert.strictEqual(typedEditor?.resource?.toString(), untypedEditorReplacement.resource.toString());

				assert.strictEqual(editorFactoryCalled, 2);
				assert.strictEqual(untitledEditorFactoryCalled, 0);
				assert.strictEqual(diffEditorFactoryCalled, 0);

				assert.strictEqual(lastEditorFactoryEditor, untypedEditorReplacement);
				assert.ok(!lastUntitledEditorFactoryEditor);
				assert.ok(!lastDiffEditorFactoryEditor);

				await resetTestState();
			}

			// untyped resource editor, options (override disabled), no group
			{
				let untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests'), options: { override: EditorResolution.DISABLED } };
				let pane = await openEditor(untypedEditor);
				let typedEditor = pane?.input;

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

			// untyped resource editor, options (override disabled, sticky: true, preserveFocus: true), no group
			{
				let untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests'), options: { sticky: true, preserveFocus: true, override: EditorResolution.DISABLED } };
				let pane = await openEditor(untypedEditor);

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
				let untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests'), options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
				let pane = await openEditor(untypedEditor);

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
				let untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests'), options: { override: TEST_EDITOR_INPUT_ID } };
				let pane = await openEditor(untypedEditor);

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
				let untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests'), options: { sticky: true, preserveFocus: true } };
				let pane = await openEditor(untypedEditor);

				assert.strictEqual(pane?.group, rootGroup);
				assert.ok(pane.input instanceof TestFileEditorInput);
				assert.strictEqual(pane.input.resource.toString(), untypedEditor.resource.toString());
				assert.strictEqual(pane.group.isSticky(pane.input), true);

				assert.strictEqual(editorFactoryCalled, 1);
				assert.strictEqual(untitledEditorFactoryCalled, 0);
				assert.strictEqual(diffEditorFactoryCalled, 0);

				assert.strictEqual((lastEditorFactoryEditor as IResourceEditorInput).resource.toString(), untypedEditor.resource.toString());
				assert.strictEqual((lastEditorFactoryEditor as IResourceEditorInput).options?.preserveFocus, true);
				assert.ok(!lastUntitledEditorFactoryEditor);
				assert.ok(!lastDiffEditorFactoryEditor);

				await resetTestState();
				await part.activeGroup.closeEditor(pane.input);
			}

			// untyped resource editor, options (override: TEST_EDITOR_INPUT_ID, sticky: true, preserveFocus: true), no group
			{
				let untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests'), options: { sticky: true, preserveFocus: true, override: TEST_EDITOR_INPUT_ID } };
				let pane = await openEditor(untypedEditor);

				assert.strictEqual(pane?.group, rootGroup);
				assert.ok(pane.input instanceof TestFileEditorInput);
				assert.strictEqual(pane.input.resource.toString(), untypedEditor.resource.toString());
				assert.strictEqual(pane.group.isSticky(pane.input), true);

				assert.strictEqual(editorFactoryCalled, 1);
				assert.strictEqual(untitledEditorFactoryCalled, 0);
				assert.strictEqual(diffEditorFactoryCalled, 0);

				assert.strictEqual((lastEditorFactoryEditor as IResourceEditorInput).resource.toString(), untypedEditor.resource.toString());
				assert.strictEqual((lastEditorFactoryEditor as IResourceEditorInput).options?.preserveFocus, true);
				assert.ok(!lastUntitledEditorFactoryEditor);
				assert.ok(!lastDiffEditorFactoryEditor);

				await resetTestState();
				await part.activeGroup.closeEditor(pane.input);
			}

			// untyped resource editor, no options, SIDE_GROUP
			{
				let untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests') };
				let pane = await openEditor(untypedEditor, SIDE_GROUP);

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

			// untyped resource editor, options (override disabled), SIDE_GROUP
			{
				let untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests'), options: { override: EditorResolution.DISABLED } };
				let pane = await openEditor(untypedEditor, SIDE_GROUP);

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
				let typedEditor = new TestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
				let pane = await openEditor({ editor: typedEditor });
				let typedInput = pane?.input;

				assert.strictEqual(pane?.group, rootGroup);
				assert.ok(typedInput instanceof TestFileEditorInput);
				assert.strictEqual(typedInput.resource.toString(), typedEditor.resource.toString());

				assert.strictEqual(editorFactoryCalled, 1);
				assert.strictEqual(untitledEditorFactoryCalled, 0);
				assert.strictEqual(diffEditorFactoryCalled, 0);

				assert.strictEqual((lastEditorFactoryEditor as IResourceEditorInput).resource.toString(), typedEditor.resource.toString());
				assert.ok(!lastUntitledEditorFactoryEditor);
				assert.ok(!lastDiffEditorFactoryEditor);

				// opening the same editor should not create
				// a new editor input
				await openEditor(typedEditor);
				assert.strictEqual(pane?.group.activeEditor, typedInput);

				// replaceEditors should work too
				let typedEditorReplacement = new TestFileEditorInput(URI.file('file-replaced.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
				await service.replaceEditors([{
					editor: typedEditor,
					replacement: typedEditorReplacement
				}], rootGroup);

				typedInput = rootGroup.activeEditor!;

				assert.ok(typedInput instanceof TestFileEditorInput);
				assert.strictEqual(typedInput.resource.toString(), typedEditorReplacement.resource.toString());

				assert.strictEqual(editorFactoryCalled, 2);
				assert.strictEqual(untitledEditorFactoryCalled, 0);
				assert.strictEqual(diffEditorFactoryCalled, 0);

				assert.strictEqual((lastEditorFactoryEditor as IResourceEditorInput).resource.toString(), typedInput.resource.toString());
				assert.ok(!lastUntitledEditorFactoryEditor);
				assert.ok(!lastDiffEditorFactoryEditor);

				await resetTestState();
			}

			// typed editor, options (override disabled), no group
			{
				let typedEditor = new TestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
				let pane = await openEditor({ editor: typedEditor, options: { override: EditorResolution.DISABLED } });
				let typedInput = pane?.input;

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

			// typed editor, options (override disabled, sticky: true, preserveFocus: true), no group
			{
				let typedEditor = new TestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
				let pane = await openEditor({ editor: typedEditor, options: { sticky: true, preserveFocus: true, override: EditorResolution.DISABLED } });

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
				let typedEditor = new TestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
				let pane = await openEditor({ editor: typedEditor, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } });

				assert.strictEqual(pane?.group, rootGroup);
				assert.ok(pane.input instanceof FileEditorInput);
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
				let typedEditor = new TestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
				let pane = await openEditor({ editor: typedEditor, options: { override: TEST_EDITOR_INPUT_ID } });

				assert.strictEqual(pane?.group, rootGroup);
				assert.ok(pane.input instanceof TestFileEditorInput);
				assert.strictEqual(pane.input.resource.toString(), typedEditor.resource.toString());

				assert.strictEqual(editorFactoryCalled, 1);
				assert.strictEqual(untitledEditorFactoryCalled, 0);
				assert.strictEqual(diffEditorFactoryCalled, 0);

				assert.strictEqual((lastEditorFactoryEditor as IResourceEditorInput).resource.toString(), typedEditor.resource.toString());
				assert.ok(!lastUntitledEditorFactoryEditor);
				assert.ok(!lastDiffEditorFactoryEditor);

				await resetTestState();
			}

			// typed editor, options (sticky: true, preserveFocus: true), no group
			{
				let typedEditor = new TestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
				let pane = await openEditor({ editor: typedEditor, options: { sticky: true, preserveFocus: true } });

				assert.strictEqual(pane?.group, rootGroup);
				assert.ok(pane.input instanceof TestFileEditorInput);
				assert.strictEqual(pane.input.resource.toString(), typedEditor.resource.toString());
				assert.strictEqual(pane.group.isSticky(pane.input), true);

				assert.strictEqual(editorFactoryCalled, 1);
				assert.strictEqual(untitledEditorFactoryCalled, 0);
				assert.strictEqual(diffEditorFactoryCalled, 0);

				assert.strictEqual((lastEditorFactoryEditor as IResourceEditorInput).resource.toString(), typedEditor.resource.toString());
				assert.strictEqual((lastEditorFactoryEditor as IResourceEditorInput).options?.preserveFocus, true);
				assert.ok(!lastUntitledEditorFactoryEditor);
				assert.ok(!lastDiffEditorFactoryEditor);

				await resetTestState();
				await part.activeGroup.closeEditor(pane.input);
			}

			// typed editor, options (override: TEST_EDITOR_INPUT_ID, sticky: true, preserveFocus: true), no group
			{
				let typedEditor = new TestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
				let pane = await openEditor({ editor: typedEditor, options: { sticky: true, preserveFocus: true, override: TEST_EDITOR_INPUT_ID } });

				assert.strictEqual(pane?.group, rootGroup);
				assert.ok(pane.input instanceof TestFileEditorInput);
				assert.strictEqual(pane.input.resource.toString(), typedEditor.resource.toString());
				assert.strictEqual(pane.group.isSticky(pane.input), true);

				assert.strictEqual(editorFactoryCalled, 1);
				assert.strictEqual(untitledEditorFactoryCalled, 0);
				assert.strictEqual(diffEditorFactoryCalled, 0);

				assert.strictEqual((lastEditorFactoryEditor as IResourceEditorInput).resource.toString(), typedEditor.resource.toString());
				assert.strictEqual((lastEditorFactoryEditor as IResourceEditorInput).options?.preserveFocus, true);
				assert.ok(!lastUntitledEditorFactoryEditor);
				assert.ok(!lastDiffEditorFactoryEditor);

				await resetTestState();
				await part.activeGroup.closeEditor(pane.input);
			}

			// typed editor, no options, SIDE_GROUP
			{
				let typedEditor = new TestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
				let pane = await openEditor({ editor: typedEditor }, SIDE_GROUP);

				assert.strictEqual(accessor.editorGroupService.groups.length, 2);
				assert.notStrictEqual(pane?.group, rootGroup);
				assert.ok(pane?.input instanceof TestFileEditorInput);
				assert.strictEqual(pane?.input.resource.toString(), typedEditor.resource.toString());

				assert.strictEqual(editorFactoryCalled, 1);
				assert.strictEqual(untitledEditorFactoryCalled, 0);
				assert.strictEqual(diffEditorFactoryCalled, 0);

				assert.strictEqual((lastEditorFactoryEditor as IResourceEditorInput).resource.toString(), typedEditor.resource.toString());
				assert.ok(!lastUntitledEditorFactoryEditor);
				assert.ok(!lastDiffEditorFactoryEditor);

				await resetTestState();
			}

			// typed editor, options (override disabled), SIDE_GROUP
			{
				let typedEditor = new TestFileEditorInput(URI.file('file.editor-service-override-tests'), TEST_EDITOR_INPUT_ID);
				let pane = await openEditor({ editor: typedEditor, options: { override: EditorResolution.DISABLED } }, SIDE_GROUP);

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
				let untypedEditor: IUntitledTextResourceEditorInput = { resource: undefined, options: { override: TEST_EDITOR_INPUT_ID } };
				let pane = await openEditor(untypedEditor);

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
				let untypedEditor: IUntitledTextResourceEditorInput = { resource: undefined, options: { override: TEST_EDITOR_INPUT_ID } };
				let pane = await openEditor(untypedEditor, SIDE_GROUP);

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
				let untypedEditor: IUntitledTextResourceEditorInput = { resource: URI.file('file-original.editor-service-override-tests').with({ scheme: 'untitled' }) };
				let pane = await openEditor(untypedEditor);
				let typedEditor = pane?.input;

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
				let untypedEditor: IUntitledTextResourceEditorInput = { resource: undefined, options: { sticky: true, preserveFocus: true, override: TEST_EDITOR_INPUT_ID } };
				let pane = await openEditor(untypedEditor);

				assert.strictEqual(pane?.group, rootGroup);
				assert.ok(pane.input instanceof TestFileEditorInput);
				assert.strictEqual(pane.input.resource.scheme, 'untitled');
				assert.strictEqual(pane.group.isSticky(pane.input), true);

				assert.strictEqual(editorFactoryCalled, 0);
				assert.strictEqual(untitledEditorFactoryCalled, 1);
				assert.strictEqual(diffEditorFactoryCalled, 0);

				assert.ok(!lastEditorFactoryEditor);
				assert.strictEqual(lastUntitledEditorFactoryEditor, untypedEditor);
				assert.strictEqual((lastUntitledEditorFactoryEditor as IUntitledTextResourceEditorInput).options?.preserveFocus, true);
				assert.strictEqual((lastUntitledEditorFactoryEditor as IUntitledTextResourceEditorInput).options?.sticky, true);
				assert.ok(!lastDiffEditorFactoryEditor);

				await resetTestState();
			}
		}

		// Untyped diff
		{
			// untyped diff editor, no options, no group
			{
				let untypedEditor: IResourceDiffEditorInput = {
					original: { resource: URI.file('file-original.editor-service-override-tests') },
					modified: { resource: URI.file('file-modified.editor-service-override-tests') },
					options: { override: TEST_EDITOR_INPUT_ID }
				};
				let pane = await openEditor(untypedEditor);
				let typedEditor = pane?.input;

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
				let untypedEditor: IResourceDiffEditorInput = {
					original: { resource: URI.file('file-original.editor-service-override-tests') },
					modified: { resource: URI.file('file-modified.editor-service-override-tests') },
					options: { override: TEST_EDITOR_INPUT_ID }
				};
				let pane = await openEditor(untypedEditor, SIDE_GROUP);

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
				let untypedEditor: IResourceDiffEditorInput = {
					original: { resource: URI.file('file-original.editor-service-override-tests') },
					modified: { resource: URI.file('file-modified.editor-service-override-tests') },
					options: {
						override: TEST_EDITOR_INPUT_ID, sticky: true, preserveFocus: true
					}
				};
				let pane = await openEditor(untypedEditor);

				assert.strictEqual(pane?.group, rootGroup);
				assert.ok(pane.input instanceof TestFileEditorInput);
				assert.strictEqual(pane.group.isSticky(pane.input), true);
				assert.strictEqual(editorFactoryCalled, 0);
				assert.strictEqual(untitledEditorFactoryCalled, 0);
				assert.strictEqual(diffEditorFactoryCalled, 1);

				assert.ok(!lastEditorFactoryEditor);
				assert.ok(!lastUntitledEditorFactoryEditor);
				assert.strictEqual(lastDiffEditorFactoryEditor, untypedEditor);
				assert.strictEqual((lastDiffEditorFactoryEditor as IUntitledTextResourceEditorInput).options?.preserveFocus, true);
				assert.strictEqual((lastDiffEditorFactoryEditor as IUntitledTextResourceEditorInput).options?.sticky, true);

				await resetTestState();
			}
		}

		// typed editor, not registered
		{

			// no options, no group
			{
				let typedEditor = new TestFileEditorInput(URI.file('file.something'), TEST_EDITOR_INPUT_ID);
				let pane = await openEditor({ editor: typedEditor });

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
				let typedEditor = new TestFileEditorInput(URI.file('file.something'), TEST_EDITOR_INPUT_ID);
				let pane = await openEditor({ editor: typedEditor }, SIDE_GROUP);

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
				let typedEditor = new TestFileEditorInput(URI.file('file.something'), TEST_EDITOR_INPUT_ID);
				typedEditor.disableToUntyped = true;
				let pane = await openEditor({ editor: typedEditor });

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
				let typedEditor = new TestFileEditorInput(URI.file('file.something'), TEST_EDITOR_INPUT_ID);
				typedEditor.disableToUntyped = true;
				let pane = await openEditor({ editor: typedEditor }, SIDE_GROUP);

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
				let untypedEditor1: IResourceEditorInput = { resource: URI.file('file1.editor-service-override-tests') };
				let untypedEditor2: IResourceEditorInput = { resource: URI.file('file2.editor-service-override-tests'), options: { override: EditorResolution.DISABLED } };
				let untypedEditor3: IEditorInputWithOptions = { editor: new TestFileEditorInput(URI.file('file3.editor-service-override-tests'), TEST_EDITOR_INPUT_ID) };
				let untypedEditor4: IEditorInputWithOptions = { editor: new TestFileEditorInput(URI.file('file4.editor-service-override-tests'), TEST_EDITOR_INPUT_ID), options: { override: EditorResolution.DISABLED } };
				let untypedEditor5: IResourceEditorInput = { resource: URI.file('file5.editor-service-override-tests') };
				let pane = (await service.openEditors([untypedEditor1, untypedEditor2, untypedEditor3, untypedEditor4, untypedEditor5]))[0];

				assert.strictEqual(pane?.group, rootGroup);
				assert.strictEqual(pane?.group.count, 5);

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
				let untypedEditor1: IResourceEditorInput = { resource: URI.file('file-1'), options: { revealIfVisible: true, pinned: true } };
				let untypedEditor2: IResourceEditorInput = { resource: URI.file('file-2'), options: { pinned: true } };

				let rootPane = await openEditor(untypedEditor1);
				let sidePane = await openEditor(untypedEditor2, SIDE_GROUP);

				assert.strictEqual(rootPane?.group?.count, 1);
				assert.strictEqual(sidePane?.group?.count, 1);

				accessor.editorGroupService.activateGroup(sidePane.group);

				await openEditor(untypedEditor1);

				assert.strictEqual(rootPane?.group?.count, 1);
				assert.strictEqual(sidePane?.group?.count, 1);

				await resetTestState();
			}

			// untyped default editor, options: revealIfOpened
			{
				let untypedEditor1: IResourceEditorInput = { resource: URI.file('file-1'), options: { revealIfOpened: true, pinned: true } };
				let untypedEditor2: IResourceEditorInput = { resource: URI.file('file-2'), options: { pinned: true } };

				let rootPane = await openEditor(untypedEditor1);
				await openEditor(untypedEditor2);
				assert.strictEqual(rootPane?.group?.activeEditor?.resource?.toString(), untypedEditor2.resource.toString());
				let sidePane = await openEditor(untypedEditor2, SIDE_GROUP);

				assert.strictEqual(rootPane?.group?.count, 2);
				assert.strictEqual(sidePane?.group?.count, 1);

				accessor.editorGroupService.activateGroup(sidePane.group);

				await openEditor(untypedEditor1);

				assert.strictEqual(rootPane?.group?.count, 2);
				assert.strictEqual(sidePane?.group?.count, 1);

				await resetTestState();
			}
		}
	}

	test('openEditor() applies options if editor already opened', async () => {
		disposables.add(registerTestFileEditor());

		const [, service, accessor] = await createEditorService();

		disposables.add(accessor.editorResolverService.registerEditor(
			'*.editor-service-override-tests',
			{ id: TEST_EDITOR_INPUT_ID, label: 'Label', priority: RegisteredEditorPriority.exclusive },
			{},
			editor => ({ editor: new TestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
		));

		// Typed editor
		let pane = await service.openEditor(new TestFileEditorInput(URI.parse('my://resource-openEditors'), TEST_EDITOR_INPUT_ID));
		pane = await service.openEditor(new TestFileEditorInput(URI.parse('my://resource-openEditors'), TEST_EDITOR_INPUT_ID), { sticky: true, preserveFocus: true });

		assert.ok(pane instanceof TestEditorWithOptions);
		assert.strictEqual(pane.lastSetOptions?.sticky, true);
		assert.strictEqual(pane.lastSetOptions?.preserveFocus, true);

		await pane.group?.closeAllEditors();

		// Untyped editor (without registered editor)
		pane = await service.openEditor({ resource: URI.file('resource-openEditors') });
		pane = await service.openEditor({ resource: URI.file('resource-openEditors'), options: { sticky: true, preserveFocus: true } });

		assert.ok(pane instanceof TestTextFileEditor);
		assert.strictEqual(pane.lastSetOptions?.sticky, true);
		assert.strictEqual(pane.lastSetOptions?.preserveFocus, true);

		// Untyped editor (with registered editor)
		pane = await service.openEditor({ resource: URI.file('file.editor-service-override-tests') });
		pane = await service.openEditor({ resource: URI.file('file.editor-service-override-tests'), options: { sticky: true, preserveFocus: true } });

		assert.ok(pane instanceof TestEditorWithOptions);
		assert.strictEqual(pane.lastSetOptions?.sticky, true);
		assert.strictEqual(pane.lastSetOptions?.preserveFocus, true);
	});

	test('isOpen() with side by side editor', async () => {
		const [part, service] = await createEditorService();

		const input = new TestFileEditorInput(URI.parse('my://resource-openEditors'), TEST_EDITOR_INPUT_ID);
		const otherInput = new TestFileEditorInput(URI.parse('my://resource2-openEditors'), TEST_EDITOR_INPUT_ID);
		const sideBySideInput = new SideBySideEditorInput('sideBySide', '', input, otherInput);

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

		await editor2?.group?.closeEditor(input);
		assert.strictEqual(part.activeGroup.count, 1);

		assert.strictEqual(service.isOpened(input), false);
		assert.strictEqual(service.isOpened(otherInput), true);
		assert.strictEqual(service.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), false);
		assert.strictEqual(service.isOpened({ resource: otherInput.resource, typeId: otherInput.typeId, editorId: otherInput.editorId }), true);

		await editor1?.group?.closeEditor(sideBySideInput);

		assert.strictEqual(service.isOpened(input), false);
		assert.strictEqual(service.isOpened(otherInput), false);
		assert.strictEqual(service.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), false);
		assert.strictEqual(service.isOpened({ resource: otherInput.resource, typeId: otherInput.typeId, editorId: otherInput.editorId }), false);
	});

	test('openEditors() / replaceEditors()', async () => {
		const [part, service] = await createEditorService();

		const input = new TestFileEditorInput(URI.parse('my://resource-openEditors'), TEST_EDITOR_INPUT_ID);
		const otherInput = new TestFileEditorInput(URI.parse('my://resource2-openEditors'), TEST_EDITOR_INPUT_ID);
		const replaceInput = new TestFileEditorInput(URI.parse('my://resource3-openEditors'), TEST_EDITOR_INPUT_ID);

		// Open editors
		await service.openEditors([{ editor: input, options: { override: EditorResolution.DISABLED } }, { editor: otherInput, options: { override: EditorResolution.DISABLED } }]);
		assert.strictEqual(part.activeGroup.count, 2);

		// Replace editors
		await service.replaceEditors([{ editor: input, replacement: replaceInput }], part.activeGroup);
		assert.strictEqual(part.activeGroup.count, 2);
		assert.strictEqual(part.activeGroup.getIndexOfEditor(replaceInput), 0);
	});

	test('openEditors() handles workspace trust (typed editors)', async () => {
		const [part, service, accessor] = await createEditorService();

		const input1 = new TestFileEditorInput(URI.parse('my://resource1-openEditors'), TEST_EDITOR_INPUT_ID);
		const input2 = new TestFileEditorInput(URI.parse('my://resource2-openEditors'), TEST_EDITOR_INPUT_ID);

		const input3 = new TestFileEditorInput(URI.parse('my://resource3-openEditors'), TEST_EDITOR_INPUT_ID);
		const input4 = new TestFileEditorInput(URI.parse('my://resource4-openEditors'), TEST_EDITOR_INPUT_ID);
		const sideBySideInput = new SideBySideEditorInput('side by side', undefined, input3, input4);

		const oldHandler = accessor.workspaceTrustRequestService.requestOpenUrisHandler;

		try {

			// Trust: cancel
			let trustEditorUris: URI[] = [];
			accessor.workspaceTrustRequestService.requestOpenUrisHandler = async uris => {
				trustEditorUris = uris;
				return WorkspaceTrustUriResponse.Cancel;
			};

			await service.openEditors([{ editor: input1, options: { override: EditorResolution.DISABLED } }, { editor: input2, options: { override: EditorResolution.DISABLED } }, { editor: sideBySideInput }], undefined, { validateTrust: true });
			assert.strictEqual(part.activeGroup.count, 0);
			assert.strictEqual(trustEditorUris.length, 4);
			assert.strictEqual(trustEditorUris.some(uri => uri.toString() === input1.resource.toString()), true);
			assert.strictEqual(trustEditorUris.some(uri => uri.toString() === input2.resource.toString()), true);
			assert.strictEqual(trustEditorUris.some(uri => uri.toString() === input3.resource.toString()), true);
			assert.strictEqual(trustEditorUris.some(uri => uri.toString() === input4.resource.toString()), true);

			// Trust: open in new window
			accessor.workspaceTrustRequestService.requestOpenUrisHandler = async uris => WorkspaceTrustUriResponse.OpenInNewWindow;

			await service.openEditors([{ editor: input1, options: { override: EditorResolution.DISABLED } }, { editor: input2, options: { override: EditorResolution.DISABLED } }, { editor: sideBySideInput, options: { override: EditorResolution.DISABLED } }], undefined, { validateTrust: true });
			assert.strictEqual(part.activeGroup.count, 0);

			// Trust: allow
			accessor.workspaceTrustRequestService.requestOpenUrisHandler = async uris => WorkspaceTrustUriResponse.Open;

			await service.openEditors([{ editor: input1, options: { override: EditorResolution.DISABLED } }, { editor: input2, options: { override: EditorResolution.DISABLED } }, { editor: sideBySideInput, options: { override: EditorResolution.DISABLED } }], undefined, { validateTrust: true });
			assert.strictEqual(part.activeGroup.count, 3);
		} finally {
			accessor.workspaceTrustRequestService.requestOpenUrisHandler = oldHandler;
		}
	});

	test('openEditors() ignores trust when `validateTrust: false', async () => {
		const [part, service, accessor] = await createEditorService();

		const input1 = new TestFileEditorInput(URI.parse('my://resource1-openEditors'), TEST_EDITOR_INPUT_ID);
		const input2 = new TestFileEditorInput(URI.parse('my://resource2-openEditors'), TEST_EDITOR_INPUT_ID);

		const input3 = new TestFileEditorInput(URI.parse('my://resource3-openEditors'), TEST_EDITOR_INPUT_ID);
		const input4 = new TestFileEditorInput(URI.parse('my://resource4-openEditors'), TEST_EDITOR_INPUT_ID);
		const sideBySideInput = new SideBySideEditorInput('side by side', undefined, input3, input4);

		const oldHandler = accessor.workspaceTrustRequestService.requestOpenUrisHandler;

		try {

			// Trust: cancel
			accessor.workspaceTrustRequestService.requestOpenUrisHandler = async uris => WorkspaceTrustUriResponse.Cancel;

			await service.openEditors([{ editor: input1, options: { override: EditorResolution.DISABLED } }, { editor: input2, options: { override: EditorResolution.DISABLED } }, { editor: sideBySideInput, options: { override: EditorResolution.DISABLED } }]);
			assert.strictEqual(part.activeGroup.count, 3);
		} finally {
			accessor.workspaceTrustRequestService.requestOpenUrisHandler = oldHandler;
		}
	});

	test('openEditors() extracts proper resources from untyped editors for workspace trust', async () => {
		const [part, service, accessor] = await createEditorService();

		const input = { resource: URI.parse('my://resource-openEditors') };
		const otherInput: IResourceDiffEditorInput = {
			original: { resource: URI.parse('my://resource2-openEditors') },
			modified: { resource: URI.parse('my://resource3-openEditors') }
		};

		const oldHandler = accessor.workspaceTrustRequestService.requestOpenUrisHandler;

		try {
			let trustEditorUris: URI[] = [];
			accessor.workspaceTrustRequestService.requestOpenUrisHandler = async uris => {
				trustEditorUris = uris;
				return oldHandler(uris);
			};

			await service.openEditors([input, otherInput], undefined, { validateTrust: true });
			assert.strictEqual(part.activeGroup.count, 0);
			assert.strictEqual(trustEditorUris.length, 3);
			assert.strictEqual(trustEditorUris.some(uri => uri.toString() === input.resource.toString()), true);
			assert.strictEqual(trustEditorUris.some(uri => uri.toString() === otherInput.original.resource?.toString()), true);
			assert.strictEqual(trustEditorUris.some(uri => uri.toString() === otherInput.modified.resource?.toString()), true);
		} finally {
			accessor.workspaceTrustRequestService.requestOpenUrisHandler = oldHandler;
		}
	});

	test('close editor does not dispose when editor opened in other group', async () => {
		const [part, service] = await createEditorService();

		const input = new TestFileEditorInput(URI.parse('my://resource-close1'), TEST_EDITOR_INPUT_ID);

		const rootGroup = part.activeGroup;
		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

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

		const input1 = new TestFileEditorInput(URI.parse('my://resource1-openside'), TEST_EDITOR_INPUT_ID);
		const input2 = new TestFileEditorInput(URI.parse('my://resource2-openside'), TEST_EDITOR_INPUT_ID);

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

		const input1 = new TestFileEditorInput(URI.parse('my://resource1-openside'), TEST_EDITOR_INPUT_ID);
		const input2 = new TestFileEditorInput(URI.parse('my://resource2-openside'), TEST_EDITOR_INPUT_ID);

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

		part.arrangeGroups(GroupsArrangement.MINIMIZE_OTHERS);
		editor = await service.openEditor(input1, { pinned: true, preserveFocus: true, activation: EditorActivation.RESTORE }, rootGroup);
		assert.strictEqual(part.activeGroup, sideGroup);
	});

	test('inactive editor group does not activate when closing editor (#117686)', async () => {
		const [part, service] = await createEditorService();

		const input1 = new TestFileEditorInput(URI.parse('my://resource1-openside'), TEST_EDITOR_INPUT_ID);
		const input2 = new TestFileEditorInput(URI.parse('my://resource2-openside'), TEST_EDITOR_INPUT_ID);

		const rootGroup = part.activeGroup;

		await service.openEditor(input1, { pinned: true }, rootGroup);
		await service.openEditor(input2, { pinned: true }, rootGroup);

		const sideGroup = (await service.openEditor(input2, { pinned: true }, SIDE_GROUP))?.group;
		assert.strictEqual(part.activeGroup, sideGroup);
		assert.notStrictEqual(rootGroup, sideGroup);

		part.arrangeGroups(GroupsArrangement.MINIMIZE_OTHERS, part.activeGroup);

		await rootGroup.closeEditor(input2);
		assert.strictEqual(part.activeGroup, sideGroup);

		assert.strictEqual(rootGroup.isMinimized, true);
		assert.strictEqual(part.activeGroup.isMinimized, false);
	});

	test('active editor change / visible editor change events', async function () {
		const [part, service] = await createEditorService();

		let input = new TestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		let otherInput = new TestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);

		let activeEditorChangeEventFired = false;
		const activeEditorChangeListener = service.onDidActiveEditorChange(() => {
			activeEditorChangeEventFired = true;
		});

		let visibleEditorChangeEventFired = false;
		const visibleEditorChangeListener = service.onDidVisibleEditorsChange(() => {
			visibleEditorChangeEventFired = true;
		});

		function assertActiveEditorChangedEvent(expected: boolean) {
			assert.strictEqual(activeEditorChangeEventFired, expected, `Unexpected active editor change state (got ${activeEditorChangeEventFired}, expected ${expected})`);
			activeEditorChangeEventFired = false;
		}

		function assertVisibleEditorsChangedEvent(expected: boolean) {
			assert.strictEqual(visibleEditorChangeEventFired, expected, `Unexpected visible editors change state (got ${visibleEditorChangeEventFired}, expected ${expected})`);
			visibleEditorChangeEventFired = false;
		}

		async function closeEditorAndWaitForNextToOpen(group: IEditorGroup, input: EditorInput): Promise<void> {
			await group.closeEditor(input);
			await timeout(0); // closing an editor will not immediately open the next one, so we need to wait
		}

		// 1.) open, open same, open other, close
		let editor = await service.openEditor(input, { pinned: true });
		const group = editor?.group!;
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
		input = new TestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		otherInput = new TestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
		editor = await service.openEditor(input);
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		editor = await service.openEditor(input, { forceReload: true });
		assertActiveEditorChangedEvent(false);
		assertVisibleEditorsChangedEvent(false);

		await closeEditorAndWaitForNextToOpen(group, input);

		// 3.) open, open inactive, close (recreate inputs that got disposed)
		input = new TestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		otherInput = new TestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
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
		input = new TestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		otherInput = new TestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
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
		input = new TestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		otherInput = new TestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
		editor = await service.openEditor(input, { pinned: true });
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		let rightGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);
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
		input = new TestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		otherInput = new TestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
		editor = await service.openEditor(input, { pinned: true });
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		rightGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);
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
		input = new TestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		otherInput = new TestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
		editor = await service.openEditor(input, { pinned: true });
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		rightGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);
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
		input = new TestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		otherInput = new TestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
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
		input = new TestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		otherInput = new TestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
		editor = await service.openEditor(input, { pinned: true });
		assertActiveEditorChangedEvent(true);
		assertVisibleEditorsChangedEvent(true);

		rightGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);
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

		let input = new TestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		let otherInput = new TestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);

		let editorsChangeEventCounter = 0;
		async function assertEditorsChangeEvent(expected: number) {
			await Event.toPromise(service.onDidEditorsChange);
			editorsChangeEventCounter++;

			assert.strictEqual(editorsChangeEventCounter, expected);
		}

		// open
		let p: Promise<unknown> = service.openEditor(input, { pinned: true });
		await assertEditorsChangeEvent(1);
		await p;

		// open (other)
		p = service.openEditor(otherInput, { pinned: true });
		await assertEditorsChangeEvent(2);
		await p;

		// close (inactive)
		p = rootGroup.closeEditor(input);
		await assertEditorsChangeEvent(3);
		await p;

		// close (active)
		p = rootGroup.closeEditor(otherInput);
		await assertEditorsChangeEvent(4);
		await p;

		input = new TestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		otherInput = new TestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);

		// open editors
		p = service.openEditors([{ editor: input, options: { pinned: true } }, { editor: otherInput, options: { pinned: true } }]);
		await assertEditorsChangeEvent(5);
		await p;

		// active editor change
		p = service.openEditor(otherInput);
		await assertEditorsChangeEvent(6);
		await p;

		// move editor (in group)
		p = service.openEditor(input, { pinned: true, index: 1 });
		await assertEditorsChangeEvent(7);
		await p;

		// move editor (across groups)
		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
		rootGroup.moveEditor(input, rightGroup);
		await assertEditorsChangeEvent(8);

		// move group
		part.moveGroup(rightGroup, rootGroup, GroupDirection.LEFT);
		await assertEditorsChangeEvent(9);
	});

	test('two active editor change events when opening editor to the side', async function () {
		const [, service] = await createEditorService();

		let input = new TestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);

		let activeEditorChangeEvents = 0;
		const activeEditorChangeListener = service.onDidActiveEditorChange(() => {
			activeEditorChangeEvents++;
		});

		function assertActiveEditorChangedEvent(expected: number) {
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
		let editor = await service.openEditor({ resource: undefined });

		assert.strictEqual(service.activeEditorPane, editor);
		assert.strictEqual(service.activeTextEditorControl, editor?.getControl());
		assert.strictEqual(service.activeTextEditorMode, 'plaintext');
	});

	test('openEditor returns NULL when opening fails or is inactive', async function () {
		const [, service] = await createEditorService();

		const input = new TestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		const otherInput = new TestFileEditorInput(URI.parse('my://resource2-inactive'), TEST_EDITOR_INPUT_ID);
		const failingInput = new TestFileEditorInput(URI.parse('my://resource3-failing'), TEST_EDITOR_INPUT_ID);
		failingInput.setFailToOpen();

		let editor = await service.openEditor(input, { pinned: true });
		assert.ok(editor);

		let otherEditor = await service.openEditor(otherInput, { inactive: true });
		assert.ok(!otherEditor);

		let failingEditor = await service.openEditor(failingInput);
		assert.ok(!failingEditor);
	});

	test('openEditor shows placeholder when restoring fails', async function () {
		const [, service] = await createEditorService();

		const input = new TestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		const failingInput = new TestFileEditorInput(URI.parse('my://resource-failing'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input, { pinned: true });
		await service.openEditor(failingInput, { inactive: true });

		failingInput.setFailToOpen();
		let failingEditor = await service.openEditor(failingInput);
		assert.ok(failingEditor instanceof UnknownErrorEditor);
	});

	test('save, saveAll, revertAll', async function () {
		const [part, service] = await createEditorService();

		const input1 = new TestFileEditorInput(URI.parse('my://resource1'), TEST_EDITOR_INPUT_ID);
		input1.dirty = true;
		const input2 = new TestFileEditorInput(URI.parse('my://resource2'), TEST_EDITOR_INPUT_ID);
		input2.dirty = true;
		const sameInput1 = new TestFileEditorInput(URI.parse('my://resource1'), TEST_EDITOR_INPUT_ID);
		sameInput1.dirty = true;

		const rootGroup = part.activeGroup;

		await service.openEditor(input1, { pinned: true });
		await service.openEditor(input2, { pinned: true });
		await service.openEditor(sameInput1, { pinned: true }, SIDE_GROUP);

		await service.save({ groupId: rootGroup.id, editor: input1 });
		assert.strictEqual(input1.gotSaved, true);

		input1.gotSaved = false;
		input1.gotSavedAs = false;
		input1.gotReverted = false;

		input1.dirty = true;
		input2.dirty = true;
		sameInput1.dirty = true;

		await service.save({ groupId: rootGroup.id, editor: input1 }, { saveAs: true });
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

		const saveRes = await service.saveAll();
		assert.strictEqual(saveRes, true);
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

		const input1 = new TestFileEditorInput(URI.parse('my://resource1'), TEST_EDITOR_INPUT_ID);
		input1.dirty = true;
		const input2 = new TestFileEditorInput(URI.parse('my://resource2'), TEST_EDITOR_INPUT_ID);
		input2.dirty = true;
		const sameInput1 = new TestFileEditorInput(URI.parse('my://resource1'), TEST_EDITOR_INPUT_ID);
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
		assert.strictEqual(saveRes, true);
		assert.strictEqual(input1.gotSaved, false);
		assert.strictEqual(input2.gotSaved, true);
		assert.strictEqual(sameInput1.gotSaved, true);
	});

	test('file delete closes editor', async function () {
		return testFileDeleteEditorClose(false);
	});

	test('file delete leaves dirty editors open', function () {
		return testFileDeleteEditorClose(true);
	});

	async function testFileDeleteEditorClose(dirty: boolean): Promise<void> {
		const [part, service, accessor] = await createEditorService();

		const input1 = new TestFileEditorInput(URI.parse('my://resource1'), TEST_EDITOR_INPUT_ID);
		input1.dirty = dirty;
		const input2 = new TestFileEditorInput(URI.parse('my://resource2'), TEST_EDITOR_INPUT_ID);
		input2.dirty = dirty;

		const rootGroup = part.activeGroup;

		await service.openEditor(input1, { pinned: true });
		await service.openEditor(input2, { pinned: true });

		assert.strictEqual(rootGroup.activeEditor, input2);

		const activeEditorChangePromise = awaitActiveEditorChange(service);
		accessor.fileService.fireAfterOperation(new FileOperationEvent(input2.resource, FileOperation.DELETE));
		if (!dirty) {
			await activeEditorChangePromise;
		}

		if (dirty) {
			assert.strictEqual(rootGroup.activeEditor, input2);
		} else {
			assert.strictEqual(rootGroup.activeEditor, input1);
		}
	}

	test('file move asks input to move', async function () {
		const [part, service, accessor] = await createEditorService();

		const input1 = new TestFileEditorInput(URI.parse('my://resource1'), TEST_EDITOR_INPUT_ID);
		const movedInput = new TestFileEditorInput(URI.parse('my://resource2'), TEST_EDITOR_INPUT_ID);
		input1.movedEditor = { editor: movedInput };

		const rootGroup = part.activeGroup;

		await service.openEditor(input1, { pinned: true });

		const activeEditorChangePromise = awaitActiveEditorChange(service);
		accessor.fileService.fireAfterOperation(new FileOperationEvent(input1.resource, FileOperation.MOVE, {
			resource: movedInput.resource,
			ctime: 0,
			etag: '',
			isDirectory: false,
			isFile: true,
			mtime: 0,
			name: 'resource2',
			size: 0,
			isSymbolicLink: false,
			readonly: false
		}));
		await activeEditorChangePromise;

		assert.strictEqual(rootGroup.activeEditor, movedInput);
	});

	function awaitActiveEditorChange(editorService: IEditorService): Promise<void> {
		return Event.toPromise(Event.once(editorService.onDidActiveEditorChange));
	}

	test('file watcher gets installed for out of workspace files', async function () {
		const [, service, accessor] = await createEditorService();

		const input1 = new TestFileEditorInput(URI.parse('file://resource1'), TEST_EDITOR_INPUT_ID);
		const input2 = new TestFileEditorInput(URI.parse('file://resource2'), TEST_EDITOR_INPUT_ID);

		await service.openEditor(input1, { pinned: true });
		assert.strictEqual(accessor.fileService.watches.length, 1);
		assert.strictEqual(accessor.fileService.watches[0].toString(), input1.resource.toString());

		const editor = await service.openEditor(input2, { pinned: true });
		assert.strictEqual(accessor.fileService.watches.length, 1);
		assert.strictEqual(accessor.fileService.watches[0].toString(), input2.resource.toString());

		await editor?.group?.closeAllEditors();
		assert.strictEqual(accessor.fileService.watches.length, 0);
	});

	test('activeEditorPane scopedContextKeyService', async function () {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) });
		const [part, service] = await createEditorService(instantiationService);

		const input1 = new TestFileEditorInput(URI.parse('file://resource1'), TEST_EDITOR_INPUT_ID);
		new TestFileEditorInput(URI.parse('file://resource2'), TEST_EDITOR_INPUT_ID);

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

		const registrationDisposable = editorResolverService.registerEditor(
			'*.md',
			{
				id: 'TestEditor',
				label: 'Test Editor',
				detail: 'Test Editor Provider',
				priority: RegisteredEditorPriority.builtin
			},
			{},
			(editorInput) => {
				editorCount++;
				return ({ editor: textEditorService.createTextEditor(editorInput) });
			},
			undefined,
			diffEditor => ({ editor: textEditorService.createTextEditor(diffEditor) })
		);
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

		const registrationDisposable = editorResolverService.registerEditor(
			'*.md',
			{
				id: 'TestEditor',
				label: 'Test Editor',
				detail: 'Test Editor Provider',
				priority: RegisteredEditorPriority.builtin
			},
			{},
			(editorInput) => {
				editorCount++;
				return ({ editor: textEditorService.createTextEditor(editorInput) });
			},
			undefined,
			diffEditor => ({ editor: textEditorService.createTextEditor(diffEditor) })
		);
		assert.strictEqual(editorCount, 0);

		const input1 = new TestFileEditorInput(URI.parse('file://test/path/resource1.txt'), TEST_EDITOR_INPUT_ID);
		const input2 = new TestFileEditorInput(URI.parse('file://test/path/resource2.txt'), TEST_EDITOR_INPUT_ID);
		const input3 = new TestFileEditorInput(URI.parse('file://test/path/resource3.md'), TEST_EDITOR_INPUT_ID);
		const input4 = new TestFileEditorInput(URI.parse('file://test/path/resource4.md'), TEST_EDITOR_INPUT_ID);

		// Open editor input 1 and it shouln't trigger override as the glob doesn't match
		await service.openEditors([{ editor: input1 }, { editor: input2 }, { editor: input3 }, { editor: input4 }]);
		assert.strictEqual(editorCount, 2);

		registrationDisposable.dispose();
	});

	test('editorResolverService - replaceEditors', async function () {
		const [part, service, accessor] = await createEditorService();
		const editorResolverService = accessor.editorResolverService;
		const textEditorService = accessor.textEditorService;

		let editorCount = 0;

		const registrationDisposable = editorResolverService.registerEditor(
			'*.md',
			{
				id: 'TestEditor',
				label: 'Test Editor',
				detail: 'Test Editor Provider',
				priority: RegisteredEditorPriority.builtin
			},
			{},
			(editorInput) => {
				editorCount++;
				return ({ editor: textEditorService.createTextEditor(editorInput) });
			},
			undefined,
			diffEditor => ({ editor: textEditorService.createTextEditor(diffEditor) })
		);

		assert.strictEqual(editorCount, 0);

		const input1 = new TestFileEditorInput(URI.parse('file://test/path/resource2.md'), TEST_EDITOR_INPUT_ID);

		// Open editor input 1 and it shouldn't trigger because I've disabled the override logic
		await service.openEditor(input1, { override: EditorResolution.DISABLED });
		assert.strictEqual(editorCount, 0);

		await service.replaceEditors([{
			editor: input1,
			replacement: input1,
		}], part.activeGroup);
		assert.strictEqual(editorCount, 1);

		registrationDisposable.dispose();
	});

	test('findEditors (in group)', async () => {
		const [part, service] = await createEditorService();

		const input = new TestFileEditorInput(URI.parse('my://resource-openEditors'), TEST_EDITOR_INPUT_ID);
		const otherInput = new TestFileEditorInput(URI.parse('my://resource2-openEditors'), TEST_EDITOR_INPUT_ID);

		// Open editors
		await service.openEditors([{ editor: input, options: { override: EditorResolution.DISABLED } }, { editor: otherInput, options: { override: EditorResolution.DISABLED } }]);
		assert.strictEqual(part.activeGroup.count, 2);

		// Try using find editors for opened editors
		{
			const found1 = service.findEditors(input.resource, part.activeGroup);
			assert.strictEqual(found1.length, 1);
			assert.strictEqual(found1[0], input);

			const found2 = service.findEditors(input, part.activeGroup);
			assert.strictEqual(found2, input);
		}
		{
			const found1 = service.findEditors(otherInput.resource, part.activeGroup);
			assert.strictEqual(found1.length, 1);
			assert.strictEqual(found1[0], otherInput);

			const found2 = service.findEditors(otherInput, part.activeGroup);
			assert.strictEqual(found2, otherInput);
		}

		// Make sure we don't find non-opened editors
		{
			const found1 = service.findEditors(URI.parse('my://no-such-resource'), part.activeGroup);
			assert.strictEqual(found1.length, 0);

			const found2 = service.findEditors({ resource: URI.parse('my://no-such-resource'), typeId: '', editorId: TEST_EDITOR_INPUT_ID }, part.activeGroup);
			assert.strictEqual(found2, undefined);
		}

		// Make sure we don't find editors across groups
		{
			const newEditor = await service.openEditor(new TestFileEditorInput(URI.parse('my://other-group-resource'), TEST_EDITOR_INPUT_ID), { pinned: true, preserveFocus: true }, SIDE_GROUP);

			const found1 = service.findEditors(input.resource, newEditor!.group!.id);
			assert.strictEqual(found1.length, 0);

			const found2 = service.findEditors(input, newEditor!.group!.id);
			assert.strictEqual(found2, undefined);
		}

		// Check we don't find editors after closing them
		await part.activeGroup.closeAllEditors();
		{
			const found1 = service.findEditors(input.resource, part.activeGroup);
			assert.strictEqual(found1.length, 0);

			const found2 = service.findEditors(input, part.activeGroup);
			assert.strictEqual(found2, undefined);
		}
	});

	test('findEditors (across groups)', async () => {
		const [part, service] = await createEditorService();

		const rootGroup = part.activeGroup;

		const input = new TestFileEditorInput(URI.parse('my://resource-openEditors'), TEST_EDITOR_INPUT_ID);
		const otherInput = new TestFileEditorInput(URI.parse('my://resource2-openEditors'), TEST_EDITOR_INPUT_ID);

		// Open editors
		await service.openEditors([{ editor: input, options: { override: EditorResolution.DISABLED } }, { editor: otherInput, options: { override: EditorResolution.DISABLED } }]);
		const sideEditor = await service.openEditor(input, { pinned: true }, SIDE_GROUP);

		// Try using find editors for opened editors
		{
			const found1 = service.findEditors(input.resource);
			assert.strictEqual(found1.length, 2);
			assert.strictEqual(found1[0].editor, input);
			assert.strictEqual(found1[0].groupId, sideEditor?.group?.id);
			assert.strictEqual(found1[1].editor, input);
			assert.strictEqual(found1[1].groupId, rootGroup.id);

			const found2 = service.findEditors(input);
			assert.strictEqual(found2.length, 2);
			assert.strictEqual(found2[0].editor, input);
			assert.strictEqual(found2[0].groupId, sideEditor?.group?.id);
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
		await sideEditor?.group?.closeAllEditors();
		{
			const found1 = service.findEditors(input.resource);
			assert.strictEqual(found1.length, 0);

			const found2 = service.findEditors(input);
			assert.strictEqual(found2.length, 0);
		}
	});
});
