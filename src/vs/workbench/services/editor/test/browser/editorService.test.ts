/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EditorActivation, IResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { URI } from '../../../../../base/common/uri.js';
import { Event } from '../../../../../base/common/event.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorCloseContext, EditorsOrder, IEditorCloseEvent, EditorInputWithOptions, IEditorPane, IResourceDiffEditorInput, isEditorInputWithOptions, IUntitledTextResourceEditorInput, IUntypedEditorInput, SideBySideEditor, isEditorInput, EditorInputCapabilities } from '../../../../common/editor.js';
import { workbenchInstantiationService, TestServiceAccessor, registerTestEditor, TestFileEditorInput, ITestInstantiationService, registerTestResourceEditor, registerTestSideBySideEditor, createEditorPart, registerTestFileEditor, TestTextFileEditor, TestSingletonFileEditorInput, workbenchTeardown } from '../../../../test/browser/workbenchTestServices.js';
import { EditorService } from '../../browser/editorService.js';
import { IEditorGroup, IEditorGroupsService, GroupDirection, GroupsArrangement } from '../../common/editorGroupsService.js';
import { EditorPart } from '../../../../browser/parts/editor/editorPart.js';
import { ACTIVE_GROUP, IBaseSaveRevertAllEditorOptions, IEditorService, PreferredGroup, SIDE_GROUP } from '../../common/editorService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { FileEditorInput } from '../../../../contrib/files/browser/editors/fileEditorInput.js';
import { timeout } from '../../../../../base/common/async.js';
import { FileOperationEvent, FileOperation } from '../../../../../platform/files/common/files.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { RegisteredEditorPriority } from '../../common/editorResolverService.js';
import { WorkspaceTrustUriResponse } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { ErrorPlaceholderEditor } from '../../../../browser/parts/editor/editorPlaceholder.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IEditorPaneService } from '../../common/editorPaneService.js';

suite('EditorService', () => {

	const TEST_EDITOR_ID = 'MyTestEditorForEditorService';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForEditorService';

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

		const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);

		testLocalInstantiationService = instantiationService;

		return [part, editorService, instantiationService.createInstance(TestServiceAccessor)];
	}

	function createTestFileEditorInput(resource: URI, typeId: string): TestFileEditorInput {
		return disposables.add(new TestFileEditorInput(resource, typeId));
	}

	test('openEditor() - basics', async () => {
		const [, service, accessor] = await createEditorService();

		await testOpenBasics(service, accessor.editorPaneService);
	});

	test('openEditor() - basics (scoped)', async () => {
		const [part, service, accessor] = await createEditorService();
		const scoped = service.createScoped('main', disposables);
		await part.whenReady;

		await testOpenBasics(scoped, accessor.editorPaneService);
	});

	async function testOpenBasics(editorService: IEditorService, editorPaneService: IEditorPaneService) {
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
		assert.strictEqual(input, editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].editor);
		assert.strictEqual(input, editorService.getEditors(EditorsOrder.SEQUENTIAL)[0].editor);
		assert.strictEqual(input, editorService.activeEditor);
		assert.strictEqual(editorService.visibleEditorPanes.length, 1);
		assert.strictEqual(editorService.visibleEditorPanes[0], editor);
		assert.ok(!editorService.activeTextEditorControl);
		assert.ok(!editorService.activeTextEditorLanguageId);
		assert.strictEqual(editorService.visibleTextEditorControls.length, 0);
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
		assert.strictEqual(0, editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length);
		assert.strictEqual(0, editorService.getEditors(EditorsOrder.SEQUENTIAL).length);
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
		assert.strictEqual(otherInput, editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].editor);
		assert.strictEqual(input, editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].editor);
		assert.strictEqual(input, editorService.getEditors(EditorsOrder.SEQUENTIAL)[0].editor);
		assert.strictEqual(otherInput, editorService.getEditors(EditorsOrder.SEQUENTIAL)[1].editor);
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

		const allSequentialEditors = editorService.getEditors(EditorsOrder.SEQUENTIAL);
		assert.strictEqual(allSequentialEditors.length, 3);
		assert.strictEqual(stickyInput, allSequentialEditors[0].editor);
		assert.strictEqual(input, allSequentialEditors[1].editor);
		assert.strictEqual(otherInput, allSequentialEditors[2].editor);

		const sequentialEditorsExcludingSticky = editorService.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true });
		assert.strictEqual(sequentialEditorsExcludingSticky.length, 2);
		assert.strictEqual(input, sequentialEditorsExcludingSticky[0].editor);
		assert.strictEqual(otherInput, sequentialEditorsExcludingSticky[1].editor);

		const mruEditorsExcludingSticky = editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true });
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

	test('openEditor() - singleton typed editors reveal instead of split', async () => {
		const [part, service] = await createEditorService();

		const input1 = disposables.add(new TestSingletonFileEditorInput(URI.parse('my://resource-basics1'), TEST_EDITOR_INPUT_ID));
		const input2 = disposables.add(new TestSingletonFileEditorInput(URI.parse('my://resource-basics2'), TEST_EDITOR_INPUT_ID));

		const input1Group = (await service.openEditor(input1, { pinned: true }))?.group;
		const input2Group = (await service.openEditor(input2, { pinned: true }, SIDE_GROUP))?.group;

		assert.strictEqual(part.activeGroup, input2Group);

		await service.openEditor(input1, { pinned: true });

		assert.strictEqual(part.activeGroup, input1Group);
	});

	test('openEditor() - locked groups', async () => {
		disposables.add(registerTestFileEditor());

		const [part, service, accessor] = await createEditorService();

		disposables.add(accessor.editorResolverService.registerEditor(
			'*.editor-service-locked-group-tests',
			{ id: TEST_EDITOR_INPUT_ID, label: 'Label', priority: RegisteredEditorPriority.exclusive },
			{},
			{
				createEditorInput: editor => ({ editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
			}
		));

		const input1: IResourceEditorInput = { resource: URI.parse('file://resource-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		const input2: IResourceEditorInput = { resource: URI.parse('file://resource2-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		const input3: IResourceEditorInput = { resource: URI.parse('file://resource3-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		const input4: IResourceEditorInput = { resource: URI.parse('file://resource4-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		const input5: IResourceEditorInput = { resource: URI.parse('file://resource5-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		const input6: IResourceEditorInput = { resource: URI.parse('file://resource6-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		const input7: IResourceEditorInput = { resource: URI.parse('file://resource7-basics.editor-service-locked-group-tests'), options: { pinned: true } };

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

		disposables.add(accessor.editorResolverService.registerEditor(
			'*.editor-service-locked-group-tests',
			{ id: TEST_EDITOR_INPUT_ID, label: 'Label', priority: RegisteredEditorPriority.exclusive },
			{},
			{
				createEditorInput: editor => ({ editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
			}
		));

		const rootGroup = part.activeGroup;
		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

		part.activateGroup(rootGroup);

		const input1: IResourceEditorInput = { resource: URI.parse('file://resource-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		const input2: IResourceEditorInput = { resource: URI.parse('file://resource2-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		const input3: IResourceEditorInput = { resource: URI.parse('file://resource3-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		const input4: IResourceEditorInput = { resource: URI.parse('file://resource4-basics.editor-service-locked-group-tests'), options: { pinned: true } };

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
			{
				createEditorInput: editor => ({ editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
			}
		));

		const rootGroup = part.activeGroup;
		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

		part.activateGroup(rootGroup);

		const input1: IResourceEditorInput = { resource: URI.parse('file://resource-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		const input2: IResourceEditorInput = { resource: URI.parse('file://resource2-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		const input3: IResourceEditorInput = { resource: URI.parse('file://resource3-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		const input4: IResourceEditorInput = { resource: URI.parse('file://resource4-basics.editor-service-locked-group-tests'), options: { pinned: true } };

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
			{
				createEditorInput: editor => ({ editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
			}
		));

		const rootGroup = part.activeGroup;
		const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

		part.activateGroup(rootGroup);

		const input1: IResourceEditorInput = { resource: URI.parse('file://resource-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		const input2: IResourceEditorInput = { resource: URI.parse('file://resource2-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		const input3: IResourceEditorInput = { resource: URI.parse('file://resource3-basics.editor-service-locked-group-tests'), options: { pinned: true } };
		const input4: IResourceEditorInput = { resource: URI.parse('file://resource4-basics.editor-service-locked-group-tests'), options: { pinned: true } };

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
			{},
			{
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
			}
		));

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

		async function openEditor(editor: EditorInputWithOptions | IUntypedEditorInput, group?: PreferredGroup): Promise<IEditorPane | undefined> {
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
				const untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests') };
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
				const untypedEditorReplacement: IResourceEditorInput = { resource: URI.file('file-replaced.editor-service-override-tests') };
				await service.replaceEditors([{
					editor: typedEditor,
					replacement: untypedEditorReplacement
				}], rootGroup);

				typedEditor = rootGroup.activeEditor!;

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
				const untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests'), options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
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
				const untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests'), options: { sticky: true, preserveFocus: true, override: DEFAULT_EDITOR_ASSOCIATION.id } };
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
				const untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests'), options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
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
				const untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests'), options: { override: TEST_EDITOR_INPUT_ID } };
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
				const untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests'), options: { sticky: true, preserveFocus: true } };
				const pane = await openEditor(untypedEditor);

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
				const untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests'), options: { sticky: true, preserveFocus: true, override: TEST_EDITOR_INPUT_ID } };
				const pane = await openEditor(untypedEditor);

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
				const untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests') };
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
				const untypedEditor: IResourceEditorInput = { resource: URI.file('file.editor-service-override-tests'), options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
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

				typedInput = rootGroup.activeEditor!;

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
				const untypedEditor: IUntitledTextResourceEditorInput = { resource: undefined, options: { override: TEST_EDITOR_INPUT_ID } };
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
				const untypedEditor: IUntitledTextResourceEditorInput = { resource: undefined, options: { override: TEST_EDITOR_INPUT_ID } };
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
				const untypedEditor: IUntitledTextResourceEditorInput = { resource: URI.file('file-original.editor-service-override-tests').with({ scheme: 'untitled' }) };
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
				const untypedEditor: IUntitledTextResourceEditorInput = { resource: undefined, options: { sticky: true, preserveFocus: true, override: TEST_EDITOR_INPUT_ID } };
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
				const untypedEditor: IResourceDiffEditorInput = {
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
				const untypedEditor: IResourceDiffEditorInput = {
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
				const untypedEditor: IResourceDiffEditorInput = {
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
				assert.strictEqual((lastDiffEditorFactoryEditor as IUntitledTextResourceEditorInput).options?.preserveFocus, true);
				assert.strictEqual((lastDiffEditorFactoryEditor as IUntitledTextResourceEditorInput).options?.sticky, true);

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
				const untypedEditor1: IResourceEditorInput = { resource: URI.file('file1.editor-service-override-tests') };
				const untypedEditor2: IResourceEditorInput = { resource: URI.file('file2.editor-service-override-tests') };
				const untypedEditor3: EditorInputWithOptions = { editor: createTestFileEditorInput(URI.file('file3.editor-service-override-tests'), TEST_EDITOR_INPUT_ID) };
				const untypedEditor4: EditorInputWithOptions = { editor: createTestFileEditorInput(URI.file('file4.editor-service-override-tests'), TEST_EDITOR_INPUT_ID) };
				const untypedEditor5: IResourceEditorInput = { resource: URI.file('file5.editor-service-override-tests') };
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
				const untypedEditor1: IResourceEditorInput = { resource: URI.file('file-1'), options: { revealIfVisible: true, pinned: true } };
				const untypedEditor2: IResourceEditorInput = { resource: URI.file('file-2'), options: { pinned: true } };

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
				const untypedEditor1: IResourceEditorInput = { resource: URI.file('file-1'), options: { revealIfOpened: true, pinned: true } };
				const untypedEditor2: IResourceEditorInput = { resource: URI.file('file-2'), options: { pinned: true } };

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

		disposables.add(accessor.editorResolverService.registerEditor(
			'*.editor-service-override-tests',
			{ id: TEST_EDITOR_INPUT_ID, label: 'Label', priority: RegisteredEditorPriority.exclusive },
			{},
			{
				createEditorInput: editor => ({ editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
			}
		));

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
			let trustEditorUris: URI[] = [];
			accessor.workspaceTrustRequestService.requestOpenUrisHandler = async uris => {
				trustEditorUris = uris;
				return WorkspaceTrustUriResponse.Cancel;
			};

			await service.openEditors([{ editor: input1 }, { editor: input2 }, { editor: sideBySideInput }], undefined, { validateTrust: true });
			assert.strictEqual(part.activeGroup.count, 0);
			assert.strictEqual(trustEditorUris.length, 4);
			assert.strictEqual(trustEditorUris.some(uri => uri.toString() === input1.resource.toString()), true);
			assert.strictEqual(trustEditorUris.some(uri => uri.toString() === input2.resource.toString()), true);
			assert.strictEqual(trustEditorUris.some(uri => uri.toString() === input3.resource.toString()), true);
			assert.strictEqual(trustEditorUris.some(uri => uri.toString() === input4.resource.toString()), true);

			// Trust: open in new window
			accessor.workspaceTrustRequestService.requestOpenUrisHandler = async uris => WorkspaceTrustUriResponse.OpenInNewWindow;

			await service.openEditors([{ editor: input1 }, { editor: input2 }, { editor: sideBySideInput }], undefined, { validateTrust: true });
			assert.strictEqual(part.activeGroup.count, 0);

			// Trust: allow
			accessor.workspaceTrustRequestService.requestOpenUrisHandler = async uris => WorkspaceTrustUriResponse.Open;

			await service.openEditors([{ editor: input1 }, { editor: input2 }, { editor: sideBySideInput }], undefined, { validateTrust: true });
			assert.strictEqual(part.activeGroup.count, 3);
		} finally {
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
			accessor.workspaceTrustRequestService.requestOpenUrisHandler = async uris => WorkspaceTrustUriResponse.Cancel;

			await service.openEditors([{ editor: input1 }, { editor: input2 }, { editor: sideBySideInput }]);
			assert.strictEqual(part.activeGroup.count, 3);
		} finally {
			accessor.workspaceTrustRequestService.requestOpenUrisHandler = oldHandler;
		}
	});

	test('openEditors() extracts proper resources from untyped editors for workspace trust', async () => {
		const [, service, accessor] = await createEditorService();

		const input = { resource: URI.file('resource-openEditors') };
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

		const input = createTestFileEditorInput(URI.parse('my://resource-close1'), TEST_EDITOR_INPUT_ID);

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

		part.arrangeGroups(GroupsArrangement.EXPAND);
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

		part.arrangeGroups(GroupsArrangement.EXPAND, part.activeGroup);

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
		input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		otherInput = createTestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
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
		input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		otherInput = createTestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);
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

		let input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);
		let otherInput = createTestFileEditorInput(URI.parse('my://resource2-active'), TEST_EDITOR_INPUT_ID);

		let editorsChangeEventCounter = 0;
		async function assertEditorsChangeEvent(fn: () => Promise<unknown>, expected: number) {
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

		const rightGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);
		await assertEditorsChangeEvent(async () => rootGroup.moveEditor(input, rightGroup), 8);

		// move group
		await assertEditorsChangeEvent(async () => part.moveGroup(rightGroup, rootGroup, GroupDirection.LEFT), 9);
	});

	test('two active editor change events when opening editor to the side', async function () {
		const [, service] = await createEditorService();

		const input = createTestFileEditorInput(URI.parse('my://resource-active'), TEST_EDITOR_INPUT_ID);

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

	async function testSaveRevertUntitled(options: IBaseSaveRevertAllEditorOptions, expectUntitled: boolean, expectScratchpad: boolean) {
		const [, service] = await createEditorService();
		const input1 = createTestFileEditorInput(URI.parse('my://resource1'), TEST_EDITOR_INPUT_ID);
		input1.dirty = true;
		const untitledInput = createTestFileEditorInput(URI.parse('my://resource2'), TEST_EDITOR_INPUT_ID);
		untitledInput.dirty = true;
		untitledInput.capabilities = EditorInputCapabilities.Untitled;
		const scratchpadInput = createTestFileEditorInput(URI.parse('my://resource3'), TEST_EDITOR_INPUT_ID);
		scratchpadInput.modified = true;
		scratchpadInput.capabilities = EditorInputCapabilities.Scratchpad | EditorInputCapabilities.Untitled;

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

	async function testFileDeleteEditorClose(dirty: boolean): Promise<void> {
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

		const input1 = createTestFileEditorInput(URI.parse('my://resource1'), TEST_EDITOR_INPUT_ID);
		const movedInput = createTestFileEditorInput(URI.parse('my://resource2'), TEST_EDITOR_INPUT_ID);
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
			readonly: false,
			locked: false,
			children: undefined
		}));
		await activeEditorChangePromise;

		assert.strictEqual(rootGroup.activeEditor, movedInput);
	});

	function awaitActiveEditorChange(editorService: IEditorService): Promise<void> {
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

		const registrationDisposable = editorResolverService.registerEditor(
			'*.md',
			{
				id: 'TestEditor',
				label: 'Test Editor',
				detail: 'Test Editor Provider',
				priority: RegisteredEditorPriority.builtin
			},
			{},
			{
				createEditorInput: (editorInput) => {
					editorCount++;
					return ({ editor: textEditorService.createTextEditor(editorInput) });
				},
				createDiffEditorInput: diffEditor => ({ editor: textEditorService.createTextEditor(diffEditor) })
			}
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
			{
				createEditorInput: (editorInput) => {
					editorCount++;
					return ({ editor: textEditorService.createTextEditor(editorInput) });
				},
				createDiffEditorInput: diffEditor => ({ editor: textEditorService.createTextEditor(diffEditor) })
			}
		);
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

		const registrationDisposable = editorResolverService.registerEditor(
			'*.md',
			{
				id: 'TestEditor',
				label: 'Test Editor',
				detail: 'Test Editor Provider',
				priority: RegisteredEditorPriority.builtin
			},
			{},
			{
				createEditorInput: (editorInput) => {
					editorCount++;
					return ({ editor: textEditorService.createTextEditor(editorInput) });
				},
				createDiffEditorInput: diffEditor => ({ editor: textEditorService.createTextEditor(diffEditor) })
			}
		);

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

			const found1 = service.findEditors(input.resource, undefined, newEditor!.group!.id);
			assert.strictEqual(found1.length, 0);

			const found2 = service.findEditors(input, undefined, newEditor!.group!.id);
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

		const sidegroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

		const events: IEditorCloseEvent[] = [];
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

		const events: IEditorCloseEvent[] = [];
		disposables.add(service.onDidCloseEditor(e => {
			events.push(e);
		}));

		await rootGroup.replaceEditors([{ editor: input1, replacement: input2 }]);

		assert.strictEqual(events[0].context, EditorCloseContext.REPLACE);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
