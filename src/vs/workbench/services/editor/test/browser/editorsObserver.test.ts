/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EditorOptions, EditorInput, IEditorInputFactoryRegistry, Extensions as EditorExtensions, IEditorInputFactory, IFileEditorInput } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';
import { workbenchInstantiationService, TestStorageService } from 'vs/workbench/test/browser/workbenchTestServices';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { IEditorRegistry, EditorDescriptor, Extensions } from 'vs/workbench/browser/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { GroupDirection } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorActivation, IEditorModel } from 'vs/platform/editor/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { EditorsObserver } from 'vs/workbench/browser/parts/editor/editorsObserver';
import { timeout } from 'vs/base/common/async';

const TEST_EDITOR_ID = 'MyTestEditorForEditorsObserver';
const TEST_EDITOR_INPUT_ID = 'testEditorInputForEditorsObserver';
const TEST_SERIALIZABLE_EDITOR_INPUT_ID = 'testSerializableEditorInputForEditorsObserver';

class TestEditorControl extends BaseEditor {

	constructor() { super(TEST_EDITOR_ID, NullTelemetryService, new TestThemeService(), new TestStorageService()); }

	async setInput(input: EditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		super.setInput(input, options, token);

		await input.resolve();
	}

	getId(): string { return TEST_EDITOR_ID; }
	layout(): void { }
	createEditor(): any { }
}

class TestEditorInput extends EditorInput implements IFileEditorInput {

	private dirty = false;

	constructor(public resource: URI) { super(); }

	getTypeId() { return TEST_EDITOR_INPUT_ID; }
	resolve(): Promise<IEditorModel | null> { return Promise.resolve(null); }
	matches(other: TestEditorInput): boolean { return other && this.resource.toString() === other.resource.toString() && other instanceof TestEditorInput; }
	setEncoding(encoding: string) { }
	getEncoding() { return undefined; }
	setPreferredEncoding(encoding: string) { }
	setMode(mode: string) { }
	setPreferredMode(mode: string) { }
	getResource(): URI { return this.resource; }
	setForceOpenAsBinary(): void { }
	isDirty(): boolean { return this.dirty; }
	setDirty(): void { this.dirty = true; }
}

class EditorsObserverTestEditorInput extends TestEditorInput {
	getTypeId() { return TEST_SERIALIZABLE_EDITOR_INPUT_ID; }
}

interface ISerializedTestInput {
	resource: string;
}

class EditorsObserverTestEditorInputFactory implements IEditorInputFactory {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(editorInput: EditorInput): string {
		let testEditorInput = <EditorsObserverTestEditorInput>editorInput;
		let testInput: ISerializedTestInput = {
			resource: testEditorInput.resource.toString()
		};

		return JSON.stringify(testInput);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		let testInput: ISerializedTestInput = JSON.parse(serializedEditorInput);

		return new EditorsObserverTestEditorInput(URI.parse(testInput.resource));
	}
}

suite('EditorsObserver', function () {

	let disposables: IDisposable[] = [];

	setup(() => {
		disposables.push(Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).registerEditorInputFactory(TEST_SERIALIZABLE_EDITOR_INPUT_ID, EditorsObserverTestEditorInputFactory));
		disposables.push(Registry.as<IEditorRegistry>(Extensions.Editors).registerEditor(EditorDescriptor.create(TestEditorControl, TEST_EDITOR_ID, 'My Test Editor For Editors Observer'), [new SyncDescriptor(TestEditorInput), new SyncDescriptor(EditorsObserverTestEditorInput)]));
	});

	teardown(() => {
		dispose(disposables);
		disposables = [];
	});

	async function createPart(): Promise<EditorPart> {
		const instantiationService = workbenchInstantiationService();
		instantiationService.invokeFunction(accessor => Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).start(accessor));

		const part = instantiationService.createInstance(EditorPart);
		part.create(document.createElement('div'));
		part.layout(400, 300);

		await part.whenRestored;

		return part;
	}

	async function createEditorObserver(): Promise<[EditorPart, EditorsObserver]> {
		const part = await createPart();

		const observer = new EditorsObserver(part, new TestStorageService());

		return [part, observer];
	}

	test('basics (single group)', async () => {
		const [part, observer] = await createEditorObserver();

		let observerChangeListenerCalled = false;
		const listener = observer.onDidChange(() => {
			observerChangeListenerCalled = true;
		});

		let currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 0);
		assert.equal(observerChangeListenerCalled, false);

		const input1 = new EditorsObserverTestEditorInput(URI.parse('foo://bar1'));

		await part.activeGroup.openEditor(input1, EditorOptions.create({ pinned: true }));

		currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 1);
		assert.equal(currentEditorsMRU[0].groupId, part.activeGroup.id);
		assert.equal(currentEditorsMRU[0].editor, input1);
		assert.equal(observerChangeListenerCalled, true);

		const input2 = new EditorsObserverTestEditorInput(URI.parse('foo://bar2'));
		const input3 = new EditorsObserverTestEditorInput(URI.parse('foo://bar3'));

		await part.activeGroup.openEditor(input2, EditorOptions.create({ pinned: true }));
		await part.activeGroup.openEditor(input3, EditorOptions.create({ pinned: true }));

		currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 3);
		assert.equal(currentEditorsMRU[0].groupId, part.activeGroup.id);
		assert.equal(currentEditorsMRU[0].editor, input3);
		assert.equal(currentEditorsMRU[1].groupId, part.activeGroup.id);
		assert.equal(currentEditorsMRU[1].editor, input2);
		assert.equal(currentEditorsMRU[2].groupId, part.activeGroup.id);
		assert.equal(currentEditorsMRU[2].editor, input1);

		await part.activeGroup.openEditor(input2, EditorOptions.create({ pinned: true }));

		currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 3);
		assert.equal(currentEditorsMRU[0].groupId, part.activeGroup.id);
		assert.equal(currentEditorsMRU[0].editor, input2);
		assert.equal(currentEditorsMRU[1].groupId, part.activeGroup.id);
		assert.equal(currentEditorsMRU[1].editor, input3);
		assert.equal(currentEditorsMRU[2].groupId, part.activeGroup.id);
		assert.equal(currentEditorsMRU[2].editor, input1);

		observerChangeListenerCalled = false;
		await part.activeGroup.closeEditor(input1);

		currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 2);
		assert.equal(currentEditorsMRU[0].groupId, part.activeGroup.id);
		assert.equal(currentEditorsMRU[0].editor, input2);
		assert.equal(currentEditorsMRU[1].groupId, part.activeGroup.id);
		assert.equal(currentEditorsMRU[1].editor, input3);
		assert.equal(observerChangeListenerCalled, true);

		await part.activeGroup.closeAllEditors();
		currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 0);

		part.dispose();
		listener.dispose();
	});

	test('basics (multi group)', async () => {
		const [part, observer] = await createEditorObserver();

		const rootGroup = part.activeGroup;

		let currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 0);

		const sideGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

		const input1 = new EditorsObserverTestEditorInput(URI.parse('foo://bar1'));

		await rootGroup.openEditor(input1, EditorOptions.create({ pinned: true, activation: EditorActivation.ACTIVATE }));
		await sideGroup.openEditor(input1, EditorOptions.create({ pinned: true, activation: EditorActivation.ACTIVATE }));

		currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 2);
		assert.equal(currentEditorsMRU[0].groupId, sideGroup.id);
		assert.equal(currentEditorsMRU[0].editor, input1);
		assert.equal(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[1].editor, input1);

		await rootGroup.openEditor(input1, EditorOptions.create({ pinned: true, activation: EditorActivation.ACTIVATE }));

		currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 2);
		assert.equal(currentEditorsMRU[0].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[0].editor, input1);
		assert.equal(currentEditorsMRU[1].groupId, sideGroup.id);
		assert.equal(currentEditorsMRU[1].editor, input1);

		// Opening an editor inactive should not change
		// the most recent editor, but rather put it behind
		const input2 = new EditorsObserverTestEditorInput(URI.parse('foo://bar2'));

		await rootGroup.openEditor(input2, EditorOptions.create({ inactive: true }));

		currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 3);
		assert.equal(currentEditorsMRU[0].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[0].editor, input1);
		assert.equal(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[1].editor, input2);
		assert.equal(currentEditorsMRU[2].groupId, sideGroup.id);
		assert.equal(currentEditorsMRU[2].editor, input1);

		await rootGroup.closeAllEditors();

		currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 1);
		assert.equal(currentEditorsMRU[0].groupId, sideGroup.id);
		assert.equal(currentEditorsMRU[0].editor, input1);

		await sideGroup.closeAllEditors();

		currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 0);

		part.dispose();
	});

	test('copy group', async () => {
		const [part, observer] = await createEditorObserver();

		const input1 = new EditorsObserverTestEditorInput(URI.parse('foo://bar1'));
		const input2 = new EditorsObserverTestEditorInput(URI.parse('foo://bar2'));
		const input3 = new EditorsObserverTestEditorInput(URI.parse('foo://bar3'));

		const rootGroup = part.activeGroup;

		await rootGroup.openEditor(input1, EditorOptions.create({ pinned: true }));
		await rootGroup.openEditor(input2, EditorOptions.create({ pinned: true }));
		await rootGroup.openEditor(input3, EditorOptions.create({ pinned: true }));

		let currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 3);
		assert.equal(currentEditorsMRU[0].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[0].editor, input3);
		assert.equal(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[1].editor, input2);
		assert.equal(currentEditorsMRU[2].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[2].editor, input1);

		const copiedGroup = part.copyGroup(rootGroup, rootGroup, GroupDirection.RIGHT);
		copiedGroup.setActive(true);

		currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 6);
		assert.equal(currentEditorsMRU[0].groupId, copiedGroup.id);
		assert.equal(currentEditorsMRU[0].editor, input3);
		assert.equal(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[1].editor, input3);
		assert.equal(currentEditorsMRU[2].groupId, copiedGroup.id);
		assert.equal(currentEditorsMRU[2].editor, input2);
		assert.equal(currentEditorsMRU[3].groupId, copiedGroup.id);
		assert.equal(currentEditorsMRU[3].editor, input1);
		assert.equal(currentEditorsMRU[4].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[4].editor, input2);
		assert.equal(currentEditorsMRU[5].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[5].editor, input1);

		part.dispose();
	});

	test('initial editors are part of observer and state is persisted & restored (single group)', async () => {
		const part = await createPart();

		const rootGroup = part.activeGroup;

		const input1 = new EditorsObserverTestEditorInput(URI.parse('foo://bar1'));
		const input2 = new EditorsObserverTestEditorInput(URI.parse('foo://bar2'));
		const input3 = new EditorsObserverTestEditorInput(URI.parse('foo://bar3'));

		await rootGroup.openEditor(input1, EditorOptions.create({ pinned: true }));
		await rootGroup.openEditor(input2, EditorOptions.create({ pinned: true }));
		await rootGroup.openEditor(input3, EditorOptions.create({ pinned: true }));

		const storage = new TestStorageService();
		const observer = new EditorsObserver(part, storage);
		await part.whenRestored;

		let currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 3);
		assert.equal(currentEditorsMRU[0].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[0].editor, input3);
		assert.equal(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[1].editor, input2);
		assert.equal(currentEditorsMRU[2].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[2].editor, input1);

		storage._onWillSaveState.fire({ reason: WillSaveStateReason.SHUTDOWN });

		const restoredObserver = new EditorsObserver(part, storage);
		await part.whenRestored;

		currentEditorsMRU = restoredObserver.editors;
		assert.equal(currentEditorsMRU.length, 3);
		assert.equal(currentEditorsMRU[0].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[0].editor, input3);
		assert.equal(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[1].editor, input2);
		assert.equal(currentEditorsMRU[2].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[2].editor, input1);

		part.dispose();
	});

	test('initial editors are part of observer (multi group)', async () => {
		const part = await createPart();

		const rootGroup = part.activeGroup;

		const input1 = new EditorsObserverTestEditorInput(URI.parse('foo://bar1'));
		const input2 = new EditorsObserverTestEditorInput(URI.parse('foo://bar2'));
		const input3 = new EditorsObserverTestEditorInput(URI.parse('foo://bar3'));

		await rootGroup.openEditor(input1, EditorOptions.create({ pinned: true }));
		await rootGroup.openEditor(input2, EditorOptions.create({ pinned: true }));

		const sideGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
		await sideGroup.openEditor(input3, EditorOptions.create({ pinned: true }));

		const storage = new TestStorageService();
		const observer = new EditorsObserver(part, storage);
		await part.whenRestored;

		let currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 3);
		assert.equal(currentEditorsMRU[0].groupId, sideGroup.id);
		assert.equal(currentEditorsMRU[0].editor, input3);
		assert.equal(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[1].editor, input2);
		assert.equal(currentEditorsMRU[2].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[2].editor, input1);

		storage._onWillSaveState.fire({ reason: WillSaveStateReason.SHUTDOWN });

		const restoredObserver = new EditorsObserver(part, storage);
		await part.whenRestored;

		currentEditorsMRU = restoredObserver.editors;
		assert.equal(currentEditorsMRU.length, 3);
		assert.equal(currentEditorsMRU[0].groupId, sideGroup.id);
		assert.equal(currentEditorsMRU[0].editor, input3);
		assert.equal(currentEditorsMRU[1].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[1].editor, input2);
		assert.equal(currentEditorsMRU[2].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[2].editor, input1);

		part.dispose();
	});

	test('observer does not restore editors that cannot be serialized', async () => {
		const part = await createPart();

		const rootGroup = part.activeGroup;

		const input1 = new TestEditorInput(URI.parse('foo://bar1'));

		await rootGroup.openEditor(input1, EditorOptions.create({ pinned: true }));

		const storage = new TestStorageService();
		const observer = new EditorsObserver(part, storage);
		await part.whenRestored;

		let currentEditorsMRU = observer.editors;
		assert.equal(currentEditorsMRU.length, 1);
		assert.equal(currentEditorsMRU[0].groupId, rootGroup.id);
		assert.equal(currentEditorsMRU[0].editor, input1);

		storage._onWillSaveState.fire({ reason: WillSaveStateReason.SHUTDOWN });

		const restoredObserver = new EditorsObserver(part, storage);
		await part.whenRestored;

		currentEditorsMRU = restoredObserver.editors;
		assert.equal(currentEditorsMRU.length, 0);

		part.dispose();
	});

	test('observer closes editors when limit reached (across all groups)', async () => {
		const part = await createPart();
		part.enforcePartOptions({ limit: { enabled: true, value: 3 } });

		const storage = new TestStorageService();
		const observer = new EditorsObserver(part, storage);

		const rootGroup = part.activeGroup;
		const sideGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

		const input1 = new TestEditorInput(URI.parse('foo://bar1'));
		const input2 = new TestEditorInput(URI.parse('foo://bar2'));
		const input3 = new TestEditorInput(URI.parse('foo://bar3'));
		const input4 = new TestEditorInput(URI.parse('foo://bar4'));

		await rootGroup.openEditor(input1, EditorOptions.create({ pinned: true }));
		await rootGroup.openEditor(input2, EditorOptions.create({ pinned: true }));
		await rootGroup.openEditor(input3, EditorOptions.create({ pinned: true }));
		await rootGroup.openEditor(input4, EditorOptions.create({ pinned: true }));

		assert.equal(rootGroup.count, 3);
		assert.equal(rootGroup.isOpened(input1), false);
		assert.equal(rootGroup.isOpened(input2), true);
		assert.equal(rootGroup.isOpened(input3), true);
		assert.equal(rootGroup.isOpened(input4), true);

		input2.setDirty();
		part.enforcePartOptions({ limit: { enabled: true, value: 1 } });

		await timeout(0);

		assert.equal(rootGroup.count, 2);
		assert.equal(rootGroup.isOpened(input1), false);
		assert.equal(rootGroup.isOpened(input2), true); // dirty
		assert.equal(rootGroup.isOpened(input3), false);
		assert.equal(rootGroup.isOpened(input4), true);

		const input5 = new TestEditorInput(URI.parse('foo://bar5'));
		await sideGroup.openEditor(input5, EditorOptions.create({ pinned: true }));

		assert.equal(rootGroup.count, 1);
		assert.equal(rootGroup.isOpened(input1), false);
		assert.equal(rootGroup.isOpened(input2), true); // dirty
		assert.equal(rootGroup.isOpened(input3), false);
		assert.equal(rootGroup.isOpened(input4), false);

		assert.equal(sideGroup.isOpened(input5), true);

		observer.dispose();
		part.dispose();
	});

	test('observer closes editors when limit reached (in group)', async () => {
		const part = await createPart();
		part.enforcePartOptions({ limit: { enabled: true, value: 3, perEditorGroup: true } });

		const storage = new TestStorageService();
		const observer = new EditorsObserver(part, storage);

		const rootGroup = part.activeGroup;
		const sideGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);

		const input1 = new TestEditorInput(URI.parse('foo://bar1'));
		const input2 = new TestEditorInput(URI.parse('foo://bar2'));
		const input3 = new TestEditorInput(URI.parse('foo://bar3'));
		const input4 = new TestEditorInput(URI.parse('foo://bar4'));

		await rootGroup.openEditor(input1, EditorOptions.create({ pinned: true }));
		await rootGroup.openEditor(input2, EditorOptions.create({ pinned: true }));
		await rootGroup.openEditor(input3, EditorOptions.create({ pinned: true }));
		await rootGroup.openEditor(input4, EditorOptions.create({ pinned: true }));

		assert.equal(rootGroup.count, 3);
		assert.equal(rootGroup.isOpened(input1), false);
		assert.equal(rootGroup.isOpened(input2), true);
		assert.equal(rootGroup.isOpened(input3), true);
		assert.equal(rootGroup.isOpened(input4), true);

		await sideGroup.openEditor(input1, EditorOptions.create({ pinned: true }));
		await sideGroup.openEditor(input2, EditorOptions.create({ pinned: true }));
		await sideGroup.openEditor(input3, EditorOptions.create({ pinned: true }));
		await sideGroup.openEditor(input4, EditorOptions.create({ pinned: true }));

		assert.equal(sideGroup.count, 3);
		assert.equal(sideGroup.isOpened(input1), false);
		assert.equal(sideGroup.isOpened(input2), true);
		assert.equal(sideGroup.isOpened(input3), true);
		assert.equal(sideGroup.isOpened(input4), true);

		part.enforcePartOptions({ limit: { enabled: true, value: 1, perEditorGroup: true } });

		await timeout(10);

		assert.equal(rootGroup.count, 1);
		assert.equal(rootGroup.isOpened(input1), false);
		assert.equal(rootGroup.isOpened(input2), false);
		assert.equal(rootGroup.isOpened(input3), false);
		assert.equal(rootGroup.isOpened(input4), true);

		assert.equal(sideGroup.count, 1);
		assert.equal(sideGroup.isOpened(input1), false);
		assert.equal(sideGroup.isOpened(input2), false);
		assert.equal(sideGroup.isOpened(input3), false);
		assert.equal(sideGroup.isOpened(input4), true);

		observer.dispose();
		part.dispose();
	});
});
