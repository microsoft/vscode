/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IEditorFactoryRegistry, EditorExtensions, EditorInputCapabilities } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';
import { workbenchInstantiationService, TestFileEditorInput, registerTestEditor, TestEditorPart, createEditorPart, registerTestSideBySideEditor } from 'vs/workbench/test/browser/workbenchTestServices';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { GroupDirection, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorActivation } from 'vs/platform/editor/common/editor';
import { WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { EditorsObserver } from 'vs/workbench/browser/parts/editor/editorsObserver';
import { timeout } from 'vs/base/common/async';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('EditorsObserver', function () {

	const TEST_EDITOR_ID = 'MyTestEditorForEditorsObserver';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForEditorsObserver';
	const TEST_SERIALIZABLE_EDITOR_INPUT_ID = 'testSerializableEditorInputForEditorsObserver';

	const disposables = new DisposableStore();

	setup(() => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput)], TEST_SERIALIZABLE_EDITOR_INPUT_ID));
		disposables.add(registerTestSideBySideEditor());
	});

	teardown(() => {
		disposables.clear();
	});

	async function createPart(): Promise<[TestEditorPart, IInstantiationService]> {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));

		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);
		disposables.add(toDisposable(() => part.clearState()));

		return [part, instantiationService];
	}

	async function createEditorObserver(scoped = false): Promise<[EditorPart, EditorsObserver, IInstantiationService]> {
		const [part, instantiationService] = await createPart();

		const observer = disposables.add(new EditorsObserver(scoped ? part : undefined, part, disposables.add(new TestStorageService())));

		return [part, observer, instantiationService];
	}

	test('basics (single group)', async () => {
		await testSingleGroupBasics();
	});

	test('basics (single group, scoped)', async () => {
		await testSingleGroupBasics(true);
	});

	async function testSingleGroupBasics(scoped = false) {
		const [part, observer] = await createEditorObserver();

		let onDidMostRecentlyActiveEditorsChangeCalled = false;
		disposables.add(observer.onDidMostRecentlyActiveEditorsChange(() => {
			onDidMostRecentlyActiveEditorsChangeCalled = true;
		}));

		let currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 0);
		assert.strictEqual(onDidMostRecentlyActiveEditorsChangeCalled, false);

		const input1 = new TestFileEditorInput(URI.parse('foo://bar1'), TEST_SERIALIZABLE_EDITOR_INPUT_ID);

		await part.activeGroup.openEditor(input1, { pinned: true });

		currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 1);
		assert.strictEqual(currentEditorsMRU[0].groupId, part.activeGroup.id);
		assert.strictEqual(currentEditorsMRU[0].editor, input1);
		assert.strictEqual(onDidMostRecentlyActiveEditorsChangeCalled, true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(observer.hasEditors(input1.resource), true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: 'unknownTypeId', editorId: 'unknownTypeId' }), false);

		const input2 = new TestFileEditorInput(URI.parse('foo://bar2'), TEST_SERIALIZABLE_EDITOR_INPUT_ID);
		const input3 = new TestFileEditorInput(URI.parse('foo://bar3'), TEST_SERIALIZABLE_EDITOR_INPUT_ID);

		assert.strictEqual(observer.hasEditors(input2.resource), false);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), false);

		await part.activeGroup.openEditor(input2, { pinned: true });
		await part.activeGroup.openEditor(input3, { pinned: true });

		currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 3);
		assert.strictEqual(currentEditorsMRU[0].groupId, part.activeGroup.id);
		assert.strictEqual(currentEditorsMRU[0].editor, input3);
		assert.strictEqual(currentEditorsMRU[1].groupId, part.activeGroup.id);
		assert.strictEqual(currentEditorsMRU[1].editor, input2);
		assert.strictEqual(currentEditorsMRU[2].groupId, part.activeGroup.id);
		assert.strictEqual(currentEditorsMRU[2].editor, input1);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), true);

		await part.activeGroup.openEditor(input2, { pinned: true });

		currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 3);
		assert.strictEqual(currentEditorsMRU[0].groupId, part.activeGroup.id);
		assert.strictEqual(currentEditorsMRU[0].editor, input2);
		assert.strictEqual(currentEditorsMRU[1].groupId, part.activeGroup.id);
		assert.strictEqual(currentEditorsMRU[1].editor, input3);
		assert.strictEqual(currentEditorsMRU[2].groupId, part.activeGroup.id);
		assert.strictEqual(currentEditorsMRU[2].editor, input1);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), true);

		onDidMostRecentlyActiveEditorsChangeCalled = false;
		await part.activeGroup.closeEditor(input1);

		currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 2);
		assert.strictEqual(currentEditorsMRU[0].groupId, part.activeGroup.id);
		assert.strictEqual(currentEditorsMRU[0].editor, input2);
		assert.strictEqual(currentEditorsMRU[1].groupId, part.activeGroup.id);
		assert.strictEqual(currentEditorsMRU[1].editor, input3);
		assert.strictEqual(onDidMostRecentlyActiveEditorsChangeCalled, true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), true);

		await part.activeGroup.closeAllEditors();
		currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 0);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), false);
	}

	test('basics (multi group)', async () => {
		const [part, observer] = await createEditorObserver();

		const rootGroup = part.activeGroup;

		let currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 0);

		const sideGroup = disposables.add(part.addGroup(rootGroup, GroupDirection.RIGHT));

		const input1 = new TestFileEditorInput(URI.parse('foo://bar1'), TEST_SERIALIZABLE_EDITOR_INPUT_ID);

		await rootGroup.openEditor(input1, { pinned: true, activation: EditorActivation.ACTIVATE });
		await sideGroup.openEditor(input1, { pinned: true, activation: EditorActivation.ACTIVATE });

		currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 2);
		assert.strictEqual(currentEditorsMRU[0].groupId, sideGroup.id);
		assert.strictEqual(currentEditorsMRU[0].editor, input1);
		assert.strictEqual(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[1].editor, input1);
		assert.strictEqual(observer.hasEditors(input1.resource), true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);

		await rootGroup.openEditor(input1, { pinned: true, activation: EditorActivation.ACTIVATE });

		currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 2);
		assert.strictEqual(currentEditorsMRU[0].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[0].editor, input1);
		assert.strictEqual(currentEditorsMRU[1].groupId, sideGroup.id);
		assert.strictEqual(currentEditorsMRU[1].editor, input1);
		assert.strictEqual(observer.hasEditors(input1.resource), true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);

		// Opening an editor inactive should not change
		// the most recent editor, but rather put it behind
		const input2 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), TEST_SERIALIZABLE_EDITOR_INPUT_ID));

		await rootGroup.openEditor(input2, { inactive: true });

		currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 3);
		assert.strictEqual(currentEditorsMRU[0].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[0].editor, input1);
		assert.strictEqual(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[1].editor, input2);
		assert.strictEqual(currentEditorsMRU[2].groupId, sideGroup.id);
		assert.strictEqual(currentEditorsMRU[2].editor, input1);
		assert.strictEqual(observer.hasEditors(input1.resource), true);
		assert.strictEqual(observer.hasEditors(input2.resource), true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);

		await rootGroup.closeAllEditors();

		currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 1);
		assert.strictEqual(currentEditorsMRU[0].groupId, sideGroup.id);
		assert.strictEqual(currentEditorsMRU[0].editor, input1);
		assert.strictEqual(observer.hasEditors(input1.resource), true);
		assert.strictEqual(observer.hasEditors(input2.resource), false);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), false);

		await sideGroup.closeAllEditors();

		currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 0);
		assert.strictEqual(observer.hasEditors(input1.resource), false);
		assert.strictEqual(observer.hasEditors(input2.resource), false);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), false);

		part.removeGroup(sideGroup);
	});

	test('hasEditor/hasEditors - same resource, different type id', async () => {
		const [part, observer] = await createEditorObserver();

		const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_SERIALIZABLE_EDITOR_INPUT_ID));
		const input2 = disposables.add(new TestFileEditorInput(input1.resource, 'otherTypeId'));

		assert.strictEqual(observer.hasEditors(input1.resource), false);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), false);

		await part.activeGroup.openEditor(input1, { pinned: true });

		assert.strictEqual(observer.hasEditors(input1.resource), true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), false);

		await part.activeGroup.openEditor(input2, { pinned: true });

		assert.strictEqual(observer.hasEditors(input1.resource), true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);

		await part.activeGroup.closeEditor(input2);

		assert.strictEqual(observer.hasEditors(input1.resource), true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), false);

		await part.activeGroup.closeEditor(input1);

		assert.strictEqual(observer.hasEditors(input1.resource), false);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), false);
	});

	test('hasEditor/hasEditors - side by side editor support', async () => {
		const [part, observer, instantiationService] = await createEditorObserver();

		const primary = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_SERIALIZABLE_EDITOR_INPUT_ID));
		const secondary = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), 'otherTypeId'));

		const input = instantiationService.createInstance(SideBySideEditorInput, 'name', undefined, secondary, primary);

		assert.strictEqual(observer.hasEditors(primary.resource), false);
		assert.strictEqual(observer.hasEditor({ resource: primary.resource, typeId: primary.typeId, editorId: primary.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: secondary.resource, typeId: secondary.typeId, editorId: secondary.editorId }), false);

		await part.activeGroup.openEditor(input, { pinned: true });

		assert.strictEqual(observer.hasEditors(primary.resource), true);
		assert.strictEqual(observer.hasEditor({ resource: primary.resource, typeId: primary.typeId, editorId: primary.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: secondary.resource, typeId: secondary.typeId, editorId: secondary.editorId }), false);

		await part.activeGroup.openEditor(primary, { pinned: true });

		assert.strictEqual(observer.hasEditors(primary.resource), true);
		assert.strictEqual(observer.hasEditor({ resource: primary.resource, typeId: primary.typeId, editorId: primary.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: secondary.resource, typeId: secondary.typeId, editorId: secondary.editorId }), false);

		await part.activeGroup.closeEditor(input);

		assert.strictEqual(observer.hasEditors(primary.resource), true);
		assert.strictEqual(observer.hasEditor({ resource: primary.resource, typeId: primary.typeId, editorId: primary.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: secondary.resource, typeId: secondary.typeId, editorId: secondary.editorId }), false);

		await part.activeGroup.closeEditor(primary);

		assert.strictEqual(observer.hasEditors(primary.resource), false);
		assert.strictEqual(observer.hasEditor({ resource: primary.resource, typeId: primary.typeId, editorId: primary.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: secondary.resource, typeId: secondary.typeId, editorId: secondary.editorId }), false);
	});

	test('copy group', async function () {
		const [part, observer] = await createEditorObserver();

		const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_SERIALIZABLE_EDITOR_INPUT_ID));
		const input2 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), TEST_SERIALIZABLE_EDITOR_INPUT_ID));
		const input3 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar3'), TEST_SERIALIZABLE_EDITOR_INPUT_ID));

		const rootGroup = part.activeGroup;

		await rootGroup.openEditor(input1, { pinned: true });
		await rootGroup.openEditor(input2, { pinned: true });
		await rootGroup.openEditor(input3, { pinned: true });

		let currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 3);
		assert.strictEqual(currentEditorsMRU[0].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[0].editor, input3);
		assert.strictEqual(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[1].editor, input2);
		assert.strictEqual(currentEditorsMRU[2].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[2].editor, input1);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), true);

		const copiedGroup = part.copyGroup(rootGroup, rootGroup, GroupDirection.RIGHT);
		copiedGroup.setActive(true);
		copiedGroup.focus();

		currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 6);
		assert.strictEqual(currentEditorsMRU[0].groupId, copiedGroup.id);
		assert.strictEqual(currentEditorsMRU[0].editor, input3);
		assert.strictEqual(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[1].editor, input3);
		assert.strictEqual(currentEditorsMRU[2].groupId, copiedGroup.id);
		assert.strictEqual(currentEditorsMRU[2].editor, input2);
		assert.strictEqual(currentEditorsMRU[3].groupId, copiedGroup.id);
		assert.strictEqual(currentEditorsMRU[3].editor, input1);
		assert.strictEqual(currentEditorsMRU[4].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[4].editor, input2);
		assert.strictEqual(currentEditorsMRU[5].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[5].editor, input1);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), true);

		await rootGroup.closeAllEditors();

		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), true);

		await copiedGroup.closeAllEditors();

		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), false);
	});

	test('initial editors are part of observer and state is persisted & restored (single group)', async () => {
		const [part] = await createPart();

		const rootGroup = part.activeGroup;

		const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_SERIALIZABLE_EDITOR_INPUT_ID));
		const input2 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), TEST_SERIALIZABLE_EDITOR_INPUT_ID));
		const input3 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar3'), TEST_SERIALIZABLE_EDITOR_INPUT_ID));

		await rootGroup.openEditor(input1, { pinned: true });
		await rootGroup.openEditor(input2, { pinned: true });
		await rootGroup.openEditor(input3, { pinned: true });

		const storage = disposables.add(new TestStorageService());
		const observer = disposables.add(new EditorsObserver(undefined, part, storage));
		await part.whenReady;

		let currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 3);
		assert.strictEqual(currentEditorsMRU[0].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[0].editor, input3);
		assert.strictEqual(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[1].editor, input2);
		assert.strictEqual(currentEditorsMRU[2].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[2].editor, input1);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), true);

		storage.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		const restoredObserver = disposables.add(new EditorsObserver(undefined, part, storage));
		await part.whenReady;

		currentEditorsMRU = restoredObserver.editors;
		assert.strictEqual(currentEditorsMRU.length, 3);
		assert.strictEqual(currentEditorsMRU[0].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[0].editor, input3);
		assert.strictEqual(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[1].editor, input2);
		assert.strictEqual(currentEditorsMRU[2].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[2].editor, input1);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), true);
	});

	test('initial editors are part of observer (multi group)', async () => {
		const [part] = await createPart();

		const rootGroup = part.activeGroup;

		const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_SERIALIZABLE_EDITOR_INPUT_ID));
		const input2 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), TEST_SERIALIZABLE_EDITOR_INPUT_ID));
		const input3 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar3'), TEST_SERIALIZABLE_EDITOR_INPUT_ID));

		await rootGroup.openEditor(input1, { pinned: true });
		await rootGroup.openEditor(input2, { pinned: true });

		const sideGroup = disposables.add(part.addGroup(rootGroup, GroupDirection.RIGHT));
		await sideGroup.openEditor(input3, { pinned: true });

		const storage = disposables.add(new TestStorageService());
		const observer = disposables.add(new EditorsObserver(undefined, part, storage));
		await part.whenReady;

		let currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 3);
		assert.strictEqual(currentEditorsMRU[0].groupId, sideGroup.id);
		assert.strictEqual(currentEditorsMRU[0].editor, input3);
		assert.strictEqual(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[1].editor, input2);
		assert.strictEqual(currentEditorsMRU[2].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[2].editor, input1);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), true);

		storage.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		const restoredObserver = disposables.add(new EditorsObserver(undefined, part, storage));
		await part.whenReady;

		currentEditorsMRU = restoredObserver.editors;
		assert.strictEqual(currentEditorsMRU.length, 3);
		assert.strictEqual(currentEditorsMRU[0].groupId, sideGroup.id);
		assert.strictEqual(currentEditorsMRU[0].editor, input3);
		assert.strictEqual(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[1].editor, input2);
		assert.strictEqual(currentEditorsMRU[2].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[2].editor, input1);
		assert.strictEqual(restoredObserver.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(restoredObserver.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);
		assert.strictEqual(restoredObserver.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), true);
	});

	test('observer does not restore editors that cannot be serialized', async () => {
		const [part] = await createPart();

		const rootGroup = part.activeGroup;

		const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_EDITOR_INPUT_ID));

		await rootGroup.openEditor(input1, { pinned: true });

		const storage = disposables.add(new TestStorageService());
		const observer = disposables.add(new EditorsObserver(undefined, part, storage));
		await part.whenReady;

		let currentEditorsMRU = observer.editors;
		assert.strictEqual(currentEditorsMRU.length, 1);
		assert.strictEqual(currentEditorsMRU[0].groupId, rootGroup.id);
		assert.strictEqual(currentEditorsMRU[0].editor, input1);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);

		storage.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		const restoredObserver = disposables.add(new EditorsObserver(undefined, part, storage));
		await part.whenReady;

		currentEditorsMRU = restoredObserver.editors;
		assert.strictEqual(currentEditorsMRU.length, 0);
		assert.strictEqual(restoredObserver.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), false);
	});

	test('observer closes editors when limit reached (across all groups)', async () => {
		const [part] = await createPart();
		disposables.add(part.enforcePartOptions({ limit: { enabled: true, value: 3 } }));

		const storage = disposables.add(new TestStorageService());
		const observer = disposables.add(new EditorsObserver(undefined, part, storage));

		const rootGroup = part.activeGroup;
		const sideGroup = disposables.add(part.addGroup(rootGroup, GroupDirection.RIGHT));

		const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_EDITOR_INPUT_ID));
		const input2 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), TEST_EDITOR_INPUT_ID));
		const input3 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar3'), TEST_EDITOR_INPUT_ID));
		const input4 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar4'), TEST_EDITOR_INPUT_ID));

		await rootGroup.openEditor(input1, { pinned: true });
		await rootGroup.openEditor(input2, { pinned: true });
		await rootGroup.openEditor(input3, { pinned: true });
		await rootGroup.openEditor(input4, { pinned: true });

		assert.strictEqual(rootGroup.count, 3);
		assert.strictEqual(rootGroup.contains(input1), false);
		assert.strictEqual(rootGroup.contains(input2), true);
		assert.strictEqual(rootGroup.contains(input3), true);
		assert.strictEqual(rootGroup.contains(input4), true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input4.resource, typeId: input4.typeId, editorId: input4.editorId }), true);

		input2.setDirty();
		disposables.add(part.enforcePartOptions({ limit: { enabled: true, value: 1 } }));

		await timeout(0);

		assert.strictEqual(rootGroup.count, 2);
		assert.strictEqual(rootGroup.contains(input1), false);
		assert.strictEqual(rootGroup.contains(input2), true); // dirty
		assert.strictEqual(rootGroup.contains(input3), false);
		assert.strictEqual(rootGroup.contains(input4), true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input4.resource, typeId: input4.typeId, editorId: input4.editorId }), true);

		const input5 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar5'), TEST_EDITOR_INPUT_ID));
		await sideGroup.openEditor(input5, { pinned: true });

		assert.strictEqual(rootGroup.count, 1);
		assert.strictEqual(rootGroup.contains(input1), false);
		assert.strictEqual(rootGroup.contains(input2), true); // dirty
		assert.strictEqual(rootGroup.contains(input3), false);
		assert.strictEqual(rootGroup.contains(input4), false);
		assert.strictEqual(sideGroup.contains(input5), true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input4.resource, typeId: input4.typeId, editorId: input4.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input5.resource, typeId: input5.typeId, editorId: input5.editorId }), true);
	});

	test('observer closes editors when limit reached (in group)', async () => {
		const [part] = await createPart();
		disposables.add(part.enforcePartOptions({ limit: { enabled: true, value: 3, perEditorGroup: true } }));

		const storage = disposables.add(new TestStorageService());
		const observer = disposables.add(new EditorsObserver(undefined, part, storage));

		const rootGroup = part.activeGroup;
		const sideGroup = disposables.add(part.addGroup(rootGroup, GroupDirection.RIGHT));

		const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_EDITOR_INPUT_ID));
		const input2 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), TEST_EDITOR_INPUT_ID));
		const input3 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar3'), TEST_EDITOR_INPUT_ID));
		const input4 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar4'), TEST_EDITOR_INPUT_ID));

		await rootGroup.openEditor(input1, { pinned: true });
		await rootGroup.openEditor(input2, { pinned: true });
		await rootGroup.openEditor(input3, { pinned: true });
		await rootGroup.openEditor(input4, { pinned: true });

		assert.strictEqual(rootGroup.count, 3); // 1 editor got closed due to our limit!
		assert.strictEqual(rootGroup.contains(input1), false);
		assert.strictEqual(rootGroup.contains(input2), true);
		assert.strictEqual(rootGroup.contains(input3), true);
		assert.strictEqual(rootGroup.contains(input4), true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input4.resource, typeId: input4.typeId, editorId: input4.editorId }), true);

		await sideGroup.openEditor(input1, { pinned: true });
		await sideGroup.openEditor(input2, { pinned: true });
		await sideGroup.openEditor(input3, { pinned: true });
		await sideGroup.openEditor(input4, { pinned: true });

		assert.strictEqual(sideGroup.count, 3);
		assert.strictEqual(sideGroup.contains(input1), false);
		assert.strictEqual(sideGroup.contains(input2), true);
		assert.strictEqual(sideGroup.contains(input3), true);
		assert.strictEqual(sideGroup.contains(input4), true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input4.resource, typeId: input4.typeId, editorId: input4.editorId }), true);

		disposables.add(part.enforcePartOptions({ limit: { enabled: true, value: 1, perEditorGroup: true } }));

		await timeout(10);

		assert.strictEqual(rootGroup.count, 1);
		assert.strictEqual(rootGroup.contains(input1), false);
		assert.strictEqual(rootGroup.contains(input2), false);
		assert.strictEqual(rootGroup.contains(input3), false);
		assert.strictEqual(rootGroup.contains(input4), true);

		assert.strictEqual(sideGroup.count, 1);
		assert.strictEqual(sideGroup.contains(input1), false);
		assert.strictEqual(sideGroup.contains(input2), false);
		assert.strictEqual(sideGroup.contains(input3), false);
		assert.strictEqual(sideGroup.contains(input4), true);

		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input4.resource, typeId: input4.typeId, editorId: input4.editorId }), true);
	});

	test('observer does not close sticky', async () => {
		const [part] = await createPart();
		disposables.add(part.enforcePartOptions({ limit: { enabled: true, value: 3 } }));

		const storage = disposables.add(new TestStorageService());
		const observer = disposables.add(new EditorsObserver(undefined, part, storage));

		const rootGroup = part.activeGroup;

		const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_EDITOR_INPUT_ID));
		const input2 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), TEST_EDITOR_INPUT_ID));
		const input3 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar3'), TEST_EDITOR_INPUT_ID));
		const input4 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar4'), TEST_EDITOR_INPUT_ID));

		await rootGroup.openEditor(input1, { pinned: true, sticky: true });
		await rootGroup.openEditor(input2, { pinned: true });
		await rootGroup.openEditor(input3, { pinned: true });
		await rootGroup.openEditor(input4, { pinned: true });

		assert.strictEqual(rootGroup.count, 3);
		assert.strictEqual(rootGroup.contains(input1), true);
		assert.strictEqual(rootGroup.contains(input2), false);
		assert.strictEqual(rootGroup.contains(input3), true);
		assert.strictEqual(rootGroup.contains(input4), true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input4.resource, typeId: input4.typeId, editorId: input4.editorId }), true);
	});

	test('observer does not close scratchpads', async () => {
		const [part] = await createPart();
		disposables.add(part.enforcePartOptions({ limit: { enabled: true, value: 3 } }));

		const storage = disposables.add(new TestStorageService());
		const observer = disposables.add(new EditorsObserver(undefined, part, storage));

		const rootGroup = part.activeGroup;

		const input1 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar1'), TEST_EDITOR_INPUT_ID));
		input1.capabilities = EditorInputCapabilities.Untitled | EditorInputCapabilities.Scratchpad;
		const input2 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar2'), TEST_EDITOR_INPUT_ID));
		const input3 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar3'), TEST_EDITOR_INPUT_ID));
		const input4 = disposables.add(new TestFileEditorInput(URI.parse('foo://bar4'), TEST_EDITOR_INPUT_ID));

		await rootGroup.openEditor(input1, { pinned: true });
		await rootGroup.openEditor(input2, { pinned: true });
		await rootGroup.openEditor(input3, { pinned: true });
		await rootGroup.openEditor(input4, { pinned: true });

		assert.strictEqual(rootGroup.count, 3);
		assert.strictEqual(rootGroup.contains(input1), true);
		assert.strictEqual(rootGroup.contains(input2), false);
		assert.strictEqual(rootGroup.contains(input3), true);
		assert.strictEqual(rootGroup.contains(input4), true);
		assert.strictEqual(observer.hasEditor({ resource: input1.resource, typeId: input1.typeId, editorId: input1.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input2.resource, typeId: input2.typeId, editorId: input2.editorId }), false);
		assert.strictEqual(observer.hasEditor({ resource: input3.resource, typeId: input3.typeId, editorId: input3.editorId }), true);
		assert.strictEqual(observer.hasEditor({ resource: input4.resource, typeId: input4.typeId, editorId: input4.editorId }), true);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
