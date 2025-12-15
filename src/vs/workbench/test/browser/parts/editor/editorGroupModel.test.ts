/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EditorGroupModel, IGroupEditorChangeEvent, IGroupEditorCloseEvent, IGroupEditorMoveEvent, IGroupEditorOpenEvent, ISerializedEditorGroupModel, isGroupEditorChangeEvent, isGroupEditorCloseEvent, isGroupEditorMoveEvent, isGroupEditorOpenEvent } from '../../../../common/editor/editorGroupModel.js';
import { EditorExtensions, IEditorFactoryRegistry, IFileEditorInput, IEditorSerializer, CloseDirection, EditorsOrder, IResourceDiffEditorInput, IResourceSideBySideEditorInput, SideBySideEditor, EditorCloseContext, GroupModelChangeKind } from '../../../../common/editor.js';
import { URI } from '../../../../../base/common/uri.js';
import { TestLifecycleService, workbenchInstantiationService } from '../../workbenchTestServices.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { TestContextService, TestStorageService } from '../../../common/workbenchTestServices.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('EditorGroupModel', () => {

	let testInstService: TestInstantiationService | undefined;

	suiteTeardown(() => {
		testInstService?.dispose();
		testInstService = undefined;
	});

	function inst(): IInstantiationService {
		if (!testInstService) {
			testInstService = new TestInstantiationService();
		}
		const inst = testInstService;
		inst.stub(IStorageService, disposables.add(new TestStorageService()));
		inst.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
		inst.stub(IWorkspaceContextService, new TestContextService());
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'right', focusRecentEditorAfterClose: true } });
		inst.stub(IConfigurationService, config);

		return inst;
	}

	function createEditorGroupModel(serialized?: ISerializedEditorGroupModel): EditorGroupModel {
		const group = disposables.add(inst().createInstance(EditorGroupModel, serialized));

		disposables.add(toDisposable(() => {
			for (const editor of group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
				group.closeEditor(editor);
			}
		}));

		return group;
	}

	function closeAllEditors(group: EditorGroupModel): void {
		for (const editor of group.getEditors(EditorsOrder.SEQUENTIAL)) {
			group.closeEditor(editor, undefined, false);
		}
	}

	function closeEditors(group: EditorGroupModel, except: EditorInput, direction?: CloseDirection): void {
		const index = group.indexOf(except);
		if (index === -1) {
			return; // not found
		}

		// Close to the left
		if (direction === CloseDirection.LEFT) {
			for (let i = index - 1; i >= 0; i--) {
				group.closeEditor(group.getEditorByIndex(i)!);
			}
		}

		// Close to the right
		else if (direction === CloseDirection.RIGHT) {
			for (let i = group.getEditors(EditorsOrder.SEQUENTIAL).length - 1; i > index; i--) {
				group.closeEditor(group.getEditorByIndex(i)!);
			}
		}

		// Both directions
		else {
			group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).filter(editor => !editor.matches(except)).forEach(editor => group.closeEditor(editor));
		}
	}

	interface GroupEvents {
		locked: number[];
		active: number[];
		index: number[];
		label: number[];
		opened: IGroupEditorOpenEvent[];
		activated: IGroupEditorChangeEvent[];
		closed: IGroupEditorCloseEvent[];
		pinned: IGroupEditorChangeEvent[];
		unpinned: IGroupEditorChangeEvent[];
		sticky: IGroupEditorChangeEvent[];
		unsticky: IGroupEditorChangeEvent[];
		transient: IGroupEditorChangeEvent[];
		moved: IGroupEditorMoveEvent[];
		disposed: IGroupEditorChangeEvent[];
	}

	function groupListener(group: EditorGroupModel): GroupEvents {
		const groupEvents: GroupEvents = {
			active: [],
			index: [],
			label: [],
			locked: [],
			opened: [],
			closed: [],
			activated: [],
			pinned: [],
			unpinned: [],
			sticky: [],
			unsticky: [],
			transient: [],
			moved: [],
			disposed: []
		};

		disposables.add(group.onDidModelChange(e => {
			if (e.kind === GroupModelChangeKind.GROUP_LOCKED) {
				groupEvents.locked.push(group.id);
				return;
			} else if (e.kind === GroupModelChangeKind.GROUP_ACTIVE) {
				groupEvents.active.push(group.id);
				return;
			} else if (e.kind === GroupModelChangeKind.GROUP_INDEX) {
				groupEvents.index.push(group.id);
				return;
			} else if (e.kind === GroupModelChangeKind.GROUP_LABEL) {
				groupEvents.label.push(group.id);
				return;
			}
			if (!e.editor) {
				return;
			}
			switch (e.kind) {
				case GroupModelChangeKind.EDITOR_OPEN:
					if (isGroupEditorOpenEvent(e)) {
						groupEvents.opened.push(e);
					}
					break;
				case GroupModelChangeKind.EDITOR_CLOSE:
					if (isGroupEditorCloseEvent(e)) {
						groupEvents.closed.push(e);
					}
					break;
				case GroupModelChangeKind.EDITOR_ACTIVE:
					if (isGroupEditorChangeEvent(e)) {
						groupEvents.activated.push(e);
					}
					break;
				case GroupModelChangeKind.EDITOR_PIN:
					if (isGroupEditorChangeEvent(e)) {
						group.isPinned(e.editor) ? groupEvents.pinned.push(e) : groupEvents.unpinned.push(e);
					}
					break;
				case GroupModelChangeKind.EDITOR_STICKY:
					if (isGroupEditorChangeEvent(e)) {
						group.isSticky(e.editor) ? groupEvents.sticky.push(e) : groupEvents.unsticky.push(e);
					}
					break;
				case GroupModelChangeKind.EDITOR_TRANSIENT:
					if (isGroupEditorChangeEvent(e)) {
						groupEvents.transient.push(e);
					}
					break;
				case GroupModelChangeKind.EDITOR_MOVE:
					if (isGroupEditorMoveEvent(e)) {
						groupEvents.moved.push(e);
					}
					break;
				case GroupModelChangeKind.EDITOR_WILL_DISPOSE:
					if (isGroupEditorChangeEvent(e)) {
						groupEvents.disposed.push(e);
					}
					break;
			}
		}));

		return groupEvents;
	}

	let index = 0;
	class TestEditorInput extends EditorInput {

		readonly resource = undefined;

		constructor(public id: string) {
			super();
		}
		override get typeId() { return 'testEditorInputForGroups'; }
		override async resolve(): Promise<IDisposable> { return null!; }

		override matches(other: TestEditorInput): boolean {
			return other && this.id === other.id && other instanceof TestEditorInput;
		}

		setDirty(): void {
			this._onDidChangeDirty.fire();
		}

		setLabel(): void {
			this._onDidChangeLabel.fire();
		}
	}

	class NonSerializableTestEditorInput extends EditorInput {

		readonly resource = undefined;

		constructor(public id: string) {
			super();
		}
		override get typeId() { return 'testEditorInputForGroups-nonSerializable'; }
		override async resolve(): Promise<IDisposable | null> { return null; }

		override matches(other: NonSerializableTestEditorInput): boolean {
			return other && this.id === other.id && other instanceof NonSerializableTestEditorInput;
		}
	}

	class TestFileEditorInput extends EditorInput implements IFileEditorInput {

		readonly preferredResource;

		constructor(public id: string, public resource: URI) {
			super();

			this.preferredResource = this.resource;
		}
		override get typeId() { return 'testFileEditorInputForGroups'; }
		override get editorId() { return this.id; }
		override async resolve(): Promise<IDisposable | null> { return null; }
		setPreferredName(name: string): void { }
		setPreferredDescription(description: string): void { }
		setPreferredResource(resource: URI): void { }
		async setEncoding(encoding: string) { }
		getEncoding() { return undefined; }
		setPreferredEncoding(encoding: string) { }
		setForceOpenAsBinary(): void { }
		setPreferredContents(contents: string): void { }
		setLanguageId(languageId: string) { }
		setPreferredLanguageId(languageId: string) { }
		isResolved(): boolean { return false; }

		override matches(other: TestFileEditorInput): boolean {
			if (super.matches(other)) {
				return true;
			}

			if (other instanceof TestFileEditorInput) {
				return isEqual(other.resource, this.resource);
			}

			return false;
		}
	}

	function input(id = String(index++), nonSerializable?: boolean, resource?: URI): EditorInput {
		if (resource) {
			return disposables.add(new TestFileEditorInput(id, resource));
		}

		return nonSerializable ? disposables.add(new NonSerializableTestEditorInput(id)) : disposables.add(new TestEditorInput(id));
	}

	interface ISerializedTestInput {
		id: string;
	}

	class TestEditorInputSerializer implements IEditorSerializer {

		static disableSerialize = false;
		static disableDeserialize = false;

		canSerialize(editorInput: EditorInput): boolean {
			return true;
		}

		serialize(editorInput: EditorInput): string | undefined {
			if (TestEditorInputSerializer.disableSerialize) {
				return undefined;
			}

			const testEditorInput = <TestEditorInput>editorInput;
			const testInput: ISerializedTestInput = {
				id: testEditorInput.id
			};

			return JSON.stringify(testInput);
		}

		deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput | undefined {
			if (TestEditorInputSerializer.disableDeserialize) {
				return undefined;
			}

			const testInput: ISerializedTestInput = JSON.parse(serializedEditorInput);

			return disposables.add(new TestEditorInput(testInput.id));
		}
	}

	const disposables = new DisposableStore();

	setup(() => {
		TestEditorInputSerializer.disableSerialize = false;
		TestEditorInputSerializer.disableDeserialize = false;

		disposables.add(Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer('testEditorInputForGroups', TestEditorInputSerializer));
	});

	teardown(() => {
		disposables.clear();

		index = 1;
	});

	test('Clone Group', function () {
		const group = createEditorGroupModel();

		const input1 = input() as TestEditorInput;
		const input2 = input();
		const input3 = input();

		// Pinned and Active
		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: false, active: true });

		// Sticky
		group.stick(input2);
		assert.ok(group.isSticky(input2));

		// Locked
		assert.strictEqual(group.isLocked, false);
		group.lock(true);
		assert.strictEqual(group.isLocked, true);

		const clone = disposables.add(group.clone());
		assert.notStrictEqual(group.id, clone.id);
		assert.strictEqual(clone.count, 3);
		assert.strictEqual(clone.isLocked, false); // locking does not clone over

		let didEditorLabelChange = false;
		const toDispose = clone.onDidModelChange((e) => {
			if (e.kind === GroupModelChangeKind.EDITOR_LABEL) {
				didEditorLabelChange = true;
			}
		});
		input1.setLabel();
		assert.ok(didEditorLabelChange);

		assert.strictEqual(clone.isPinned(input1), true);
		assert.strictEqual(clone.isActive(input1), false);
		assert.strictEqual(clone.isSticky(input1), false);

		assert.strictEqual(clone.isPinned(input2), true);
		assert.strictEqual(clone.isActive(input2), false);
		assert.strictEqual(clone.isSticky(input2), true);

		assert.strictEqual(clone.isPinned(input3), false);
		assert.strictEqual(clone.isActive(input3), true);
		assert.strictEqual(clone.isSticky(input3), false);

		toDispose.dispose();
	});

	test('isActive - untyped', () => {
		const group = createEditorGroupModel();
		const input = disposables.add(new TestFileEditorInput('testInput', URI.file('fake')));
		const input2 = disposables.add(new TestFileEditorInput('testInput2', URI.file('fake2')));
		const untypedInput = { resource: URI.file('/fake'), options: { override: 'testInput' } };
		const untypedNonActiveInput = { resource: URI.file('/fake2'), options: { override: 'testInput2' } };

		group.openEditor(input, { pinned: true, active: true });
		group.openEditor(input2, { active: false });

		assert.ok(group.isActive(input));
		assert.ok(group.isActive(untypedInput));
		assert.ok(!group.isActive(untypedNonActiveInput));
	});

	test('openEditor - prefers existing side by side editor if same', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const group = createEditorGroupModel();
		const input1 = disposables.add(new TestFileEditorInput('testInput', URI.file('fake1')));
		const input2 = disposables.add(new TestFileEditorInput('testInput', URI.file('fake2')));

		const sideBySideInputSame = instantiationService.createInstance(SideBySideEditorInput, undefined, undefined, input1, input1);
		const sideBySideInputDifferent = instantiationService.createInstance(SideBySideEditorInput, undefined, undefined, input1, input2);

		let res = group.openEditor(sideBySideInputSame, { pinned: true, active: true });
		assert.strictEqual(res.editor, sideBySideInputSame);
		assert.strictEqual(res.isNew, true);

		res = group.openEditor(input1, { pinned: true, active: true, supportSideBySide: SideBySideEditor.BOTH });
		assert.strictEqual(res.editor, sideBySideInputSame);
		assert.strictEqual(res.isNew, false);

		group.closeEditor(sideBySideInputSame);
		res = group.openEditor(sideBySideInputDifferent, { pinned: true, active: true });
		assert.strictEqual(res.editor, sideBySideInputDifferent);
		assert.strictEqual(res.isNew, true);

		res = group.openEditor(input1, { pinned: true, active: true });
		assert.strictEqual(res.editor, input1);
		assert.strictEqual(res.isNew, true);
	});

	test('indexOf() - prefers direct matching editor over side by side matching one', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const group = createEditorGroupModel();
		const input1 = disposables.add(new TestFileEditorInput('testInput', URI.file('fake1')));

		const sideBySideInput = instantiationService.createInstance(SideBySideEditorInput, undefined, undefined, input1, input1);

		group.openEditor(sideBySideInput, { pinned: true, active: true });
		assert.strictEqual(group.indexOf(sideBySideInput), 0);
		assert.strictEqual(group.indexOf(input1), -1);
		assert.strictEqual(group.indexOf(input1, undefined, { supportSideBySide: SideBySideEditor.BOTH }), 0);
		assert.strictEqual(group.indexOf(input1, undefined, { supportSideBySide: SideBySideEditor.ANY }), 0);

		group.openEditor(input1, { pinned: true, active: true });
		assert.strictEqual(group.indexOf(input1), 1);
		assert.strictEqual(group.indexOf(input1, undefined, { supportSideBySide: SideBySideEditor.BOTH }), 1);
		assert.strictEqual(group.indexOf(input1, undefined, { supportSideBySide: SideBySideEditor.ANY }), 1);
	});

	test('contains() - untyped', function () {
		const group = createEditorGroupModel();
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const input1 = input('input1', false, URI.file('/input1'));
		const input2 = input('input2', false, URI.file('/input2'));

		const untypedInput1 = { resource: URI.file('/input1'), options: { override: 'input1' } };
		const untypedInput2 = { resource: URI.file('/input2'), options: { override: 'input2' } };

		const diffInput1 = instantiationService.createInstance(DiffEditorInput, 'name', 'description', input1, input2, undefined);
		const diffInput2 = instantiationService.createInstance(DiffEditorInput, 'name', 'description', input2, input1, undefined);

		const untypedDiffInput1: IResourceDiffEditorInput = {
			original: untypedInput1,
			modified: untypedInput2
		};
		const untypedDiffInput2: IResourceDiffEditorInput = {
			original: untypedInput2,
			modified: untypedInput1
		};

		const sideBySideInputSame = instantiationService.createInstance(SideBySideEditorInput, 'name', undefined, input1, input1);
		const sideBySideInputDifferent = instantiationService.createInstance(SideBySideEditorInput, 'name', undefined, input1, input2);

		const untypedSideBySideInputSame: IResourceSideBySideEditorInput = {
			primary: untypedInput1,
			secondary: untypedInput1
		};
		const untypedSideBySideInputDifferent: IResourceSideBySideEditorInput = {
			primary: untypedInput2,
			secondary: untypedInput1
		};

		group.openEditor(input1, { pinned: true, active: true });

		assert.strictEqual(group.contains(untypedInput1), true);
		assert.strictEqual(group.contains(untypedInput1, { strictEquals: true }), false);
		assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.BOTH }), true);
		assert.strictEqual(group.contains(untypedInput2), false);
		assert.strictEqual(group.contains(untypedInput2, { strictEquals: true }), false);
		assert.strictEqual(group.contains(untypedInput2, { supportSideBySide: SideBySideEditor.ANY }), false);
		assert.strictEqual(group.contains(untypedInput2, { supportSideBySide: SideBySideEditor.BOTH }), false);
		assert.strictEqual(group.contains(untypedDiffInput1), false);
		assert.strictEqual(group.contains(untypedDiffInput2), false);

		group.openEditor(input2, { pinned: true, active: true });

		assert.strictEqual(group.contains(untypedInput1), true);
		assert.strictEqual(group.contains(untypedInput2), true);
		assert.strictEqual(group.contains(untypedDiffInput1), false);
		assert.strictEqual(group.contains(untypedDiffInput2), false);

		group.openEditor(diffInput1, { pinned: true, active: true });

		assert.strictEqual(group.contains(untypedInput1), true);
		assert.strictEqual(group.contains(untypedInput2), true);
		assert.strictEqual(group.contains(untypedDiffInput1), true);
		assert.strictEqual(group.contains(untypedDiffInput2), false);

		group.openEditor(diffInput2, { pinned: true, active: true });

		assert.strictEqual(group.contains(untypedInput1), true);
		assert.strictEqual(group.contains(untypedInput2), true);
		assert.strictEqual(group.contains(untypedDiffInput1), true);
		assert.strictEqual(group.contains(untypedDiffInput2), true);

		group.closeEditor(input1);

		assert.strictEqual(group.contains(untypedInput1), false);
		assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.BOTH }), false);
		assert.strictEqual(group.contains(untypedInput2), true);
		assert.strictEqual(group.contains(untypedDiffInput1), true);
		assert.strictEqual(group.contains(untypedDiffInput2), true);

		group.closeEditor(input2);

		assert.strictEqual(group.contains(untypedInput1), false);
		assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(untypedInput2), false);
		assert.strictEqual(group.contains(untypedInput2, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(untypedDiffInput1), true);
		assert.strictEqual(group.contains(untypedDiffInput2), true);

		group.closeEditor(diffInput1);

		assert.strictEqual(group.contains(untypedInput1), false);
		assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(untypedInput2), false);
		assert.strictEqual(group.contains(untypedInput2, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(untypedDiffInput1), false);
		assert.strictEqual(group.contains(untypedDiffInput2), true);

		group.closeEditor(diffInput2);

		assert.strictEqual(group.contains(untypedInput1), false);
		assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY }), false);
		assert.strictEqual(group.contains(untypedInput2), false);
		assert.strictEqual(group.contains(untypedInput2, { supportSideBySide: SideBySideEditor.ANY }), false);
		assert.strictEqual(group.contains(untypedDiffInput1), false);
		assert.strictEqual(group.contains(untypedDiffInput2), false);

		assert.strictEqual(group.count, 0);
		group.openEditor(sideBySideInputSame, { pinned: true, active: true });
		assert.strictEqual(group.contains(untypedSideBySideInputSame), true);
		assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.BOTH }), true);
		assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY, strictEquals: true }), false);
		assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.BOTH, strictEquals: true }), false);

		group.closeEditor(sideBySideInputSame);

		assert.strictEqual(group.count, 0);
		group.openEditor(sideBySideInputDifferent, { pinned: true, active: true });
		assert.strictEqual(group.contains(untypedSideBySideInputDifferent), true);
		assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.BOTH }), false);
	});

	test('contains()', () => {
		const group = createEditorGroupModel();
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const input1 = input();
		const input2 = input();

		const diffInput1 = instantiationService.createInstance(DiffEditorInput, 'name', 'description', input1, input2, undefined);
		const diffInput2 = instantiationService.createInstance(DiffEditorInput, 'name', 'description', input2, input1, undefined);

		const sideBySideInputSame = instantiationService.createInstance(SideBySideEditorInput, 'name', undefined, input1, input1);
		const sideBySideInputDifferent = instantiationService.createInstance(SideBySideEditorInput, 'name', undefined, input1, input2);

		group.openEditor(input1, { pinned: true, active: true });

		assert.strictEqual(group.contains(input1), true);
		assert.strictEqual(group.contains(input1, { strictEquals: true }), true);
		assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(input2), false);
		assert.strictEqual(group.contains(input2, { strictEquals: true }), false);
		assert.strictEqual(group.contains(input2, { supportSideBySide: SideBySideEditor.ANY }), false);
		assert.strictEqual(group.contains(diffInput1), false);
		assert.strictEqual(group.contains(diffInput2), false);

		group.openEditor(input2, { pinned: true, active: true });

		assert.strictEqual(group.contains(input1), true);
		assert.strictEqual(group.contains(input2), true);
		assert.strictEqual(group.contains(diffInput1), false);
		assert.strictEqual(group.contains(diffInput2), false);

		group.openEditor(diffInput1, { pinned: true, active: true });

		assert.strictEqual(group.contains(input1), true);
		assert.strictEqual(group.contains(input2), true);
		assert.strictEqual(group.contains(diffInput1), true);
		assert.strictEqual(group.contains(diffInput2), false);

		group.openEditor(diffInput2, { pinned: true, active: true });

		assert.strictEqual(group.contains(input1), true);
		assert.strictEqual(group.contains(input2), true);
		assert.strictEqual(group.contains(diffInput1), true);
		assert.strictEqual(group.contains(diffInput2), true);

		group.closeEditor(input1);

		assert.strictEqual(group.contains(input1), false);
		assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(input2), true);
		assert.strictEqual(group.contains(diffInput1), true);
		assert.strictEqual(group.contains(diffInput2), true);

		group.closeEditor(input2);

		assert.strictEqual(group.contains(input1), false);
		assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(input2), false);
		assert.strictEqual(group.contains(input2, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(diffInput1), true);
		assert.strictEqual(group.contains(diffInput2), true);

		group.closeEditor(diffInput1);

		assert.strictEqual(group.contains(input1), false);
		assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(input2), false);
		assert.strictEqual(group.contains(input2, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(diffInput1), false);
		assert.strictEqual(group.contains(diffInput2), true);

		group.closeEditor(diffInput2);

		assert.strictEqual(group.contains(input1), false);
		assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY }), false);
		assert.strictEqual(group.contains(input2), false);
		assert.strictEqual(group.contains(input2, { supportSideBySide: SideBySideEditor.ANY }), false);
		assert.strictEqual(group.contains(diffInput1), false);
		assert.strictEqual(group.contains(diffInput2), false);

		const input3 = input(undefined, true, URI.parse('foo://bar'));

		const input4 = input(undefined, true, URI.parse('foo://barsomething'));

		group.openEditor(input3, { pinned: true, active: true });
		assert.strictEqual(group.contains(input4), false);
		assert.strictEqual(group.contains(input3), true);

		group.closeEditor(input3);

		assert.strictEqual(group.contains(input3), false);

		assert.strictEqual(group.count, 0);
		group.openEditor(sideBySideInputSame, { pinned: true, active: true });

		assert.strictEqual(group.contains(sideBySideInputSame), true);
		assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.BOTH }), true);
		assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY, strictEquals: true }), true);
		assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.BOTH, strictEquals: true }), true);

		group.closeEditor(sideBySideInputSame);

		assert.strictEqual(group.count, 0);
		group.openEditor(sideBySideInputDifferent, { pinned: true, active: true });
		assert.strictEqual(group.contains(sideBySideInputDifferent), true);
		assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY }), true);
		assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY, strictEquals: true }), true);
		assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.BOTH }), false);
		assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.BOTH, strictEquals: true }), false);
	});

	test('group serialization', function () {
		inst().invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const group = createEditorGroupModel();

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Case 1: inputs can be serialized and deserialized

		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: false, active: true });

		let deserialized = createEditorGroupModel(group.serialize());
		assert.strictEqual(group.id, deserialized.id);
		assert.strictEqual(deserialized.count, 3);
		assert.strictEqual(deserialized.getEditors(EditorsOrder.SEQUENTIAL).length, 3);
		assert.strictEqual(deserialized.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 3);
		assert.strictEqual(deserialized.isPinned(input1), true);
		assert.strictEqual(deserialized.isPinned(input2), true);
		assert.strictEqual(deserialized.isPinned(input3), false);
		assert.strictEqual(deserialized.isActive(input3), true);

		// Case 2: inputs cannot be serialized
		TestEditorInputSerializer.disableSerialize = true;

		deserialized = createEditorGroupModel(group.serialize());
		assert.strictEqual(group.id, deserialized.id);
		assert.strictEqual(deserialized.count, 0);
		assert.strictEqual(deserialized.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
		assert.strictEqual(deserialized.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);

		// Case 3: inputs cannot be deserialized
		TestEditorInputSerializer.disableSerialize = false;
		TestEditorInputSerializer.disableDeserialize = true;

		deserialized = createEditorGroupModel(group.serialize());
		assert.strictEqual(group.id, deserialized.id);
		assert.strictEqual(deserialized.count, 0);
		assert.strictEqual(deserialized.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
		assert.strictEqual(deserialized.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
	});

	test('group serialization (sticky editor)', function () {
		inst().invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const group = createEditorGroupModel();

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Case 1: inputs can be serialized and deserialized

		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: false, active: true });

		group.stick(input2);
		assert.ok(group.isSticky(input2));

		let deserialized = createEditorGroupModel(group.serialize());
		assert.strictEqual(group.id, deserialized.id);
		assert.strictEqual(deserialized.count, 3);

		assert.strictEqual(deserialized.isPinned(input1), true);
		assert.strictEqual(deserialized.isActive(input1), false);
		assert.strictEqual(deserialized.isSticky(input1), false);

		assert.strictEqual(deserialized.isPinned(input2), true);
		assert.strictEqual(deserialized.isActive(input2), false);
		assert.strictEqual(deserialized.isSticky(input2), true);

		assert.strictEqual(deserialized.isPinned(input3), false);
		assert.strictEqual(deserialized.isActive(input3), true);
		assert.strictEqual(deserialized.isSticky(input3), false);

		// Case 2: inputs cannot be serialized
		TestEditorInputSerializer.disableSerialize = true;

		deserialized = createEditorGroupModel(group.serialize());
		assert.strictEqual(group.id, deserialized.id);
		assert.strictEqual(deserialized.count, 0);
		assert.strictEqual(deserialized.stickyCount, 0);
		assert.strictEqual(deserialized.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
		assert.strictEqual(deserialized.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);

		// Case 3: inputs cannot be deserialized
		TestEditorInputSerializer.disableSerialize = false;
		TestEditorInputSerializer.disableDeserialize = true;

		deserialized = createEditorGroupModel(group.serialize());
		assert.strictEqual(group.id, deserialized.id);
		assert.strictEqual(deserialized.count, 0);
		assert.strictEqual(deserialized.stickyCount, 0);
		assert.strictEqual(deserialized.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
		assert.strictEqual(deserialized.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
	});

	test('group serialization (locked group)', function () {
		const group = createEditorGroupModel();
		const events = groupListener(group);

		assert.strictEqual(events.locked.length, 0);

		group.lock(true);
		group.lock(true);

		assert.strictEqual(events.locked.length, 1);

		group.lock(false);
		group.lock(false);

		assert.strictEqual(events.locked.length, 2);
	});

	test('locked group', function () {
		const group = createEditorGroupModel();
		group.lock(true);

		let deserialized = createEditorGroupModel(group.serialize());
		assert.strictEqual(group.id, deserialized.id);
		assert.strictEqual(deserialized.count, 0);
		assert.strictEqual(deserialized.isLocked, true);

		group.lock(false);
		deserialized = createEditorGroupModel(group.serialize());
		assert.strictEqual(group.id, deserialized.id);
		assert.strictEqual(deserialized.count, 0);
		assert.strictEqual(deserialized.isLocked, false);
	});

	test('index', function () {
		const group = createEditorGroupModel();
		const events = groupListener(group);

		assert.strictEqual(events.index.length, 0);

		group.setIndex(4);

		assert.strictEqual(events.index.length, 1);
	});

	test('label', function () {
		const group = createEditorGroupModel();
		const events = groupListener(group);

		assert.strictEqual(events.label.length, 0);

		group.setLabel('Window 1');

		assert.strictEqual(events.label.length, 1);
	});

	test('active', function () {
		const group = createEditorGroupModel();
		const events = groupListener(group);

		assert.strictEqual(events.active.length, 0);

		group.setActive(undefined);

		assert.strictEqual(events.active.length, 1);
	});

	test('One Editor', function () {
		const group = createEditorGroupModel();
		const events = groupListener(group);

		assert.strictEqual(group.count, 0);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);

		// Active && Pinned
		const input1 = input();
		const { editor: openedEditor, isNew } = group.openEditor(input1, { active: true, pinned: true });
		assert.strictEqual(openedEditor, input1);
		assert.strictEqual(isNew, true);

		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 1);
		assert.strictEqual(group.findEditor(input1)![0], input1);
		assert.strictEqual(group.activeEditor, input1);
		assert.strictEqual(group.isActive(input1), true);
		assert.strictEqual(group.isPinned(input1), true);
		assert.strictEqual(group.isPinned(0), true);
		assert.strictEqual(group.isFirst(input1), true);
		assert.strictEqual(group.isLast(input1), true);

		assert.strictEqual(events.opened[0].editor, input1);
		assert.strictEqual(events.opened[0].editorIndex, 0);
		assert.strictEqual(events.activated[0].editor, input1);
		assert.strictEqual(events.activated[0].editorIndex, 0);

		const index = group.indexOf(input1);
		assert.strictEqual(group.findEditor(input1)![1], index);
		let event = group.closeEditor(input1, EditorCloseContext.UNPIN);
		assert.strictEqual(event?.editor, input1);
		assert.strictEqual(event?.editorIndex, index);
		assert.strictEqual(group.count, 0);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
		assert.strictEqual(group.activeEditor, null);
		assert.strictEqual(group.isFirst(input1), false);
		assert.strictEqual(group.isLast(input1), false);
		assert.strictEqual(events.closed[0].editor, input1);
		assert.strictEqual(events.closed[0].editorIndex, 0);
		assert.strictEqual(events.closed[0].context === EditorCloseContext.UNPIN, true);

		// Active && Preview
		const input2 = input();
		group.openEditor(input2, { active: true, pinned: false });

		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 1);
		assert.strictEqual(group.activeEditor, input2);
		assert.strictEqual(group.isActive(input2), true);
		assert.strictEqual(group.isPinned(input2), false);
		assert.strictEqual(group.isPinned(0), false);

		assert.strictEqual(events.opened[1].editor, input2);
		assert.strictEqual(events.opened[1].editorIndex, 0);
		assert.strictEqual(events.activated[1].editor, input2);
		assert.strictEqual(events.activated[1].editorIndex, 0);

		group.closeEditor(input2);
		assert.strictEqual(group.count, 0);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
		assert.strictEqual(group.activeEditor, null);
		assert.strictEqual(events.closed[1].editor, input2);
		assert.strictEqual(events.closed[1].editorIndex, 0);
		assert.strictEqual(events.closed[1].context === EditorCloseContext.REPLACE, false);

		event = group.closeEditor(input2);
		assert.ok(!event);
		assert.strictEqual(group.count, 0);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
		assert.strictEqual(group.activeEditor, null);
		assert.strictEqual(events.closed[1].editor, input2);

		// Nonactive && Pinned => gets active because its first editor
		const input3 = input();
		group.openEditor(input3, { active: false, pinned: true });

		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 1);
		assert.strictEqual(group.activeEditor, input3);
		assert.strictEqual(group.isActive(input3), true);
		assert.strictEqual(group.isPinned(input3), true);
		assert.strictEqual(group.isPinned(0), true);

		assert.strictEqual(events.opened[2].editor, input3);
		assert.strictEqual(events.activated[2].editor, input3);

		group.closeEditor(input3);
		assert.strictEqual(group.count, 0);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
		assert.strictEqual(group.activeEditor, null);
		assert.strictEqual(events.closed[2].editor, input3);

		assert.strictEqual(events.opened[2].editor, input3);
		assert.strictEqual(events.activated[2].editor, input3);

		group.closeEditor(input3);
		assert.strictEqual(group.count, 0);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
		assert.strictEqual(group.activeEditor, null);
		assert.strictEqual(events.closed[2].editor, input3);

		// Nonactive && Preview => gets active because its first editor
		const input4 = input();
		group.openEditor(input4);

		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 1);
		assert.strictEqual(group.activeEditor, input4);
		assert.strictEqual(group.isActive(input4), true);
		assert.strictEqual(group.isPinned(input4), false);
		assert.strictEqual(group.isPinned(0), false);

		assert.strictEqual(events.opened[3].editor, input4);
		assert.strictEqual(events.activated[3].editor, input4);

		group.closeEditor(input4);
		assert.strictEqual(group.count, 0);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
		assert.strictEqual(group.activeEditor, null);
		assert.strictEqual(events.closed[3].editor, input4);
	});

	test('Multiple Editors - Pinned and Active', function () {
		const group = createEditorGroupModel();
		const events = groupListener(group);

		const input1 = input('1');
		const input1Copy = input('1');
		const input2 = input('2');
		const input3 = input('3');

		// Pinned and Active
		let openedEditorResult = group.openEditor(input1, { pinned: true, active: true });
		assert.strictEqual(openedEditorResult.editor, input1);
		assert.strictEqual(openedEditorResult.isNew, true);

		openedEditorResult = group.openEditor(input1Copy, { pinned: true, active: true }); // opening copy of editor should still return existing one
		assert.strictEqual(openedEditorResult.editor, input1);
		assert.strictEqual(openedEditorResult.isNew, false);

		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: true, active: true });

		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 3);
		assert.strictEqual(group.activeEditor, input3);
		assert.strictEqual(group.isActive(input1), false);
		assert.strictEqual(group.isPinned(input1), true);
		assert.strictEqual(group.isActive(input2), false);
		assert.strictEqual(group.isPinned(input2), true);
		assert.strictEqual(group.isActive(input3), true);
		assert.strictEqual(group.isPinned(input3), true);
		assert.strictEqual(group.isFirst(input1), true);
		assert.strictEqual(group.isFirst(input2), false);
		assert.strictEqual(group.isFirst(input3), false);
		assert.strictEqual(group.isLast(input1), false);
		assert.strictEqual(group.isLast(input2), false);
		assert.strictEqual(group.isLast(input3), true);

		assert.strictEqual(events.opened[0].editor, input1);
		assert.strictEqual(events.opened[1].editor, input2);
		assert.strictEqual(events.opened[2].editor, input3);

		assert.strictEqual(events.activated[0].editor, input1);
		assert.strictEqual(events.activated[0].editorIndex, 0);
		assert.strictEqual(events.activated[1].editor, input2);
		assert.strictEqual(events.activated[1].editorIndex, 1);
		assert.strictEqual(events.activated[2].editor, input3);
		assert.strictEqual(events.activated[2].editorIndex, 2);

		const mru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
		assert.strictEqual(mru[0], input3);
		assert.strictEqual(mru[1], input2);
		assert.strictEqual(mru[2], input1);

		// Add some tests where a matching input is used
		// and verify that events carry the original input
		const sameInput1 = input('1');
		group.openEditor(sameInput1, { pinned: true, active: true });
		assert.strictEqual(events.activated[3].editor, input1);
		assert.strictEqual(events.activated[3].editorIndex, 0);

		group.unpin(sameInput1);
		assert.strictEqual(events.unpinned[0].editor, input1);
		assert.strictEqual(events.unpinned[0].editorIndex, 0);

		group.pin(sameInput1);
		assert.strictEqual(events.pinned[0].editor, input1);
		assert.strictEqual(events.pinned[0].editorIndex, 0);

		group.stick(sameInput1);
		assert.strictEqual(events.sticky[0].editor, input1);
		assert.strictEqual(events.sticky[0].editorIndex, 0);

		group.unstick(sameInput1);
		assert.strictEqual(events.unsticky[0].editor, input1);
		assert.strictEqual(events.unsticky[0].editorIndex, 0);

		group.moveEditor(sameInput1, 1);
		assert.strictEqual(events.moved[0].editor, input1);
		assert.strictEqual(events.moved[0].oldEditorIndex, 0);
		assert.strictEqual(events.moved[0].editorIndex, 1);

		group.closeEditor(sameInput1);
		assert.strictEqual(events.closed[0].editor, input1);
		assert.strictEqual(events.closed[0].editorIndex, 1);

		closeAllEditors(group);

		assert.strictEqual(events.closed.length, 3);
		assert.strictEqual(group.count, 0);
	});

	test('Multiple Editors - Preview editor moves to the side of the active one', function () {
		const group = createEditorGroupModel();

		const input1 = input();
		const input2 = input();
		const input3 = input();

		group.openEditor(input1, { pinned: false, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: true, active: true });

		assert.strictEqual(input3, group.getEditors(EditorsOrder.SEQUENTIAL)[2]);

		const input4 = input();
		group.openEditor(input4, { pinned: false, active: true }); // this should cause the preview editor to move after input3

		assert.strictEqual(input4, group.getEditors(EditorsOrder.SEQUENTIAL)[2]);
	});

	test('Multiple Editors - Pinned and Active (DEFAULT_OPEN_EDITOR_DIRECTION = Direction.LEFT)', function () {
		const inst = new TestInstantiationService();
		inst.stub(IStorageService, disposables.add(new TestStorageService()));
		inst.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
		inst.stub(IWorkspaceContextService, new TestContextService());
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		inst.stub(IConfigurationService, config);
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'left' } });

		const group: EditorGroupModel = disposables.add(inst.createInstance(EditorGroupModel, undefined));

		const events = groupListener(group);

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Pinned and Active
		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: true, active: true });

		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input3);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input2);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[2], input1);

		closeAllEditors(group);

		assert.strictEqual(events.closed.length, 3);
		assert.strictEqual(group.count, 0);
		inst.dispose();
	});

	test('Multiple Editors - Pinned and Not Active', function () {
		const group = createEditorGroupModel();

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Pinned and Active
		group.openEditor(input1, { pinned: true });
		group.openEditor(input2, { pinned: true });
		group.openEditor(input3, { pinned: true });

		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 3);
		assert.strictEqual(group.activeEditor, input1);
		assert.strictEqual(group.isActive(input1), true);
		assert.strictEqual(group.isPinned(input1), true);
		assert.strictEqual(group.isPinned(0), true);
		assert.strictEqual(group.isActive(input2), false);
		assert.strictEqual(group.isPinned(input2), true);
		assert.strictEqual(group.isPinned(1), true);
		assert.strictEqual(group.isActive(input3), false);
		assert.strictEqual(group.isPinned(input3), true);
		assert.strictEqual(group.isPinned(2), true);
		assert.strictEqual(group.isPinned(input3), true);

		const mru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
		assert.strictEqual(mru[0], input1);
		assert.strictEqual(mru[1], input3);
		assert.strictEqual(mru[2], input2);
	});

	test('Multiple Editors - Preview gets overwritten', function () {
		const group = createEditorGroupModel();
		const events = groupListener(group);

		const input1 = input();
		const input2 = input();
		const input3 = input();

		// Non active, preview
		group.openEditor(input1); // becomes active, preview
		group.openEditor(input2); // overwrites preview
		group.openEditor(input3); // overwrites preview

		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 1);
		assert.strictEqual(group.activeEditor, input3);
		assert.strictEqual(group.isActive(input3), true);
		assert.strictEqual(group.isPinned(input3), false);
		assert.strictEqual(!group.isPinned(input3), true);

		assert.strictEqual(events.opened[0].editor, input1);
		assert.strictEqual(events.opened[1].editor, input2);
		assert.strictEqual(events.opened[2].editor, input3);
		assert.strictEqual(events.closed[0].editor, input1);
		assert.strictEqual(events.closed[1].editor, input2);
		assert.strictEqual(events.closed[0].context === EditorCloseContext.REPLACE, true);
		assert.strictEqual(events.closed[1].context === EditorCloseContext.REPLACE, true);

		const mru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
		assert.strictEqual(mru[0], input3);
		assert.strictEqual(mru.length, 1);
	});

	test('Multiple Editors - set active', function () {
		const group = createEditorGroupModel();
		const events = groupListener(group);

		const input1 = input();
		const input2 = input();
		const input3 = input();

		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: false, active: true });

		assert.strictEqual(group.activeEditor, input3);

		let mru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
		assert.strictEqual(mru[0], input3);
		assert.strictEqual(mru[1], input2);
		assert.strictEqual(mru[2], input1);

		group.setActive(input3);
		assert.strictEqual(events.activated.length, 3);

		group.setActive(input1);
		assert.strictEqual(events.activated[3].editor, input1);
		assert.strictEqual(group.activeEditor, input1);
		assert.strictEqual(group.isActive(input1), true);
		assert.strictEqual(group.isActive(input2), false);
		assert.strictEqual(group.isActive(input3), false);

		mru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
		assert.strictEqual(mru[0], input1);
		assert.strictEqual(mru[1], input3);
		assert.strictEqual(mru[2], input2);
	});

	test('Multiple Editors - pin and unpin', function () {
		const group = createEditorGroupModel();
		const events = groupListener(group);

		const input1 = input();
		const input2 = input();
		const input3 = input();

		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: false, active: true });

		assert.strictEqual(group.activeEditor, input3);
		assert.strictEqual(group.count, 3);

		group.pin(input3);

		assert.strictEqual(group.activeEditor, input3);
		assert.strictEqual(group.isPinned(input3), true);
		assert.strictEqual(group.isActive(input3), true);
		assert.strictEqual(events.pinned[0].editor, input3);
		assert.strictEqual(group.count, 3);

		group.unpin(input1);

		assert.strictEqual(group.activeEditor, input3);
		assert.strictEqual(group.isPinned(input1), false);
		assert.strictEqual(group.isActive(input1), false);
		assert.strictEqual(events.unpinned[0].editor, input1);
		assert.strictEqual(group.count, 3);

		group.unpin(input2);

		assert.strictEqual(group.activeEditor, input3);
		assert.strictEqual(group.count, 2); // 2 previews got merged into one
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input2);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input3);
		assert.strictEqual(events.closed[0].editor, input1);
		assert.strictEqual(group.count, 2);

		group.unpin(input3);

		assert.strictEqual(group.activeEditor, input3);
		assert.strictEqual(group.count, 1); // pinning replaced the preview
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input3);
		assert.strictEqual(events.closed[1].editor, input2);
		assert.strictEqual(group.count, 1);
	});

	test('Multiple Editors - closing picks next from MRU list', function () {
		const group = createEditorGroupModel();
		const events = groupListener(group);

		const input1 = input();
		const input2 = input();
		const input3 = input();
		const input4 = input();
		const input5 = input();

		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: true, active: true });
		group.openEditor(input4, { pinned: true, active: true });
		group.openEditor(input5, { pinned: true, active: true });

		assert.strictEqual(group.activeEditor, input5);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0], input5);
		assert.strictEqual(group.count, 5);

		group.closeEditor(input5);
		assert.strictEqual(group.activeEditor, input4);
		assert.strictEqual(events.activated[5].editor, input4);
		assert.strictEqual(group.count, 4);

		group.setActive(input1);
		group.setActive(input4);
		group.closeEditor(input4);

		assert.strictEqual(group.activeEditor, input1);
		assert.strictEqual(group.count, 3);

		group.closeEditor(input1);

		assert.strictEqual(group.activeEditor, input3);
		assert.strictEqual(group.count, 2);

		group.setActive(input2);
		group.closeEditor(input2);

		assert.strictEqual(group.activeEditor, input3);
		assert.strictEqual(group.count, 1);

		group.closeEditor(input3);

		assert.ok(!group.activeEditor);
		assert.strictEqual(group.count, 0);
	});

	test('Multiple Editors - closing picks next to the right', function () {
		const inst = new TestInstantiationService();
		inst.stub(IStorageService, disposables.add(new TestStorageService()));
		inst.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
		inst.stub(IWorkspaceContextService, new TestContextService());
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { focusRecentEditorAfterClose: false } });
		inst.stub(IConfigurationService, config);

		const group = disposables.add(inst.createInstance(EditorGroupModel, undefined));
		const events = groupListener(group);

		const input1 = input();
		const input2 = input();
		const input3 = input();
		const input4 = input();
		const input5 = input();

		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: true, active: true });
		group.openEditor(input4, { pinned: true, active: true });
		group.openEditor(input5, { pinned: true, active: true });

		assert.strictEqual(group.activeEditor, input5);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0], input5);
		assert.strictEqual(group.count, 5);

		group.closeEditor(input5);
		assert.strictEqual(group.activeEditor, input4);
		assert.strictEqual(events.activated[5].editor, input4);
		assert.strictEqual(group.count, 4);

		group.setActive(input1);
		group.closeEditor(input1);

		assert.strictEqual(group.activeEditor, input2);
		assert.strictEqual(group.count, 3);

		group.setActive(input3);
		group.closeEditor(input3);

		assert.strictEqual(group.activeEditor, input4);
		assert.strictEqual(group.count, 2);

		group.closeEditor(input4);

		assert.strictEqual(group.activeEditor, input2);
		assert.strictEqual(group.count, 1);

		group.closeEditor(input2);

		assert.ok(!group.activeEditor);
		assert.strictEqual(group.count, 0);
		inst.dispose();
	});

	test('Multiple Editors - move editor', function () {
		const group = createEditorGroupModel();
		const events = groupListener(group);

		const input1 = input();
		const input2 = input();
		const input3 = input();
		const input4 = input();
		const input5 = input();

		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });

		group.moveEditor(input1, 1);

		assert.strictEqual(events.moved[0].editor, input1);
		assert.strictEqual(events.moved[0].oldEditorIndex, 0);
		assert.strictEqual(events.moved[0].editorIndex, 1);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input2);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input1);

		group.setActive(input1);
		group.openEditor(input3, { pinned: true, active: true });
		group.openEditor(input4, { pinned: true, active: true });
		group.openEditor(input5, { pinned: true, active: true });

		group.moveEditor(input4, 0);

		assert.strictEqual(events.moved[1].editor, input4);
		assert.strictEqual(events.moved[1].oldEditorIndex, 3);
		assert.strictEqual(events.moved[1].editorIndex, 0);
		assert.strictEqual(events.moved[1].editor, input4);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input4);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input2);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[2], input1);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[3], input3);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[4], input5);

		group.moveEditor(input4, 3);
		group.moveEditor(input2, 1);

		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input1);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input2);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[2], input3);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[3], input4);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[4], input5);

		assert.strictEqual(events.moved.length, 4);
		group.moveEditor(input1, 0);
		assert.strictEqual(events.moved.length, 4);
		group.moveEditor(input1, -1);
		assert.strictEqual(events.moved.length, 4);

		group.moveEditor(input5, 4);
		assert.strictEqual(events.moved.length, 4);
		group.moveEditor(input5, 100);
		assert.strictEqual(events.moved.length, 4);

		group.moveEditor(input5, -1);
		assert.strictEqual(events.moved.length, 5);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input5);

		group.moveEditor(input1, 100);
		assert.strictEqual(events.moved.length, 6);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[4], input1);
	});

	test('Multiple Editors - move editor across groups', function () {
		const group1 = createEditorGroupModel();
		const group2 = createEditorGroupModel();

		const g1_input1 = input();
		const g1_input2 = input();
		const g2_input1 = input();

		group1.openEditor(g1_input1, { active: true, pinned: true });
		group1.openEditor(g1_input2, { active: true, pinned: true });
		group2.openEditor(g2_input1, { active: true, pinned: true });

		// A move across groups is a close in the one group and an open in the other group at a specific index
		group2.closeEditor(g2_input1);
		group1.openEditor(g2_input1, { active: true, pinned: true, index: 1 });

		assert.strictEqual(group1.count, 3);
		assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[0], g1_input1);
		assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[1], g2_input1);
		assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[2], g1_input2);
	});

	test('Multiple Editors - move editor across groups (input already exists in group 1)', function () {
		const group1 = createEditorGroupModel();
		const group2 = createEditorGroupModel();

		const g1_input1 = input();
		const g1_input2 = input();
		const g1_input3 = input();
		const g2_input1 = g1_input2;

		group1.openEditor(g1_input1, { active: true, pinned: true });
		group1.openEditor(g1_input2, { active: true, pinned: true });
		group1.openEditor(g1_input3, { active: true, pinned: true });
		group2.openEditor(g2_input1, { active: true, pinned: true });

		// A move across groups is a close in the one group and an open in the other group at a specific index
		group2.closeEditor(g2_input1);
		group1.openEditor(g2_input1, { active: true, pinned: true, index: 0 });

		assert.strictEqual(group1.count, 3);
		assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[0], g1_input2);
		assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[1], g1_input1);
		assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[2], g1_input3);
	});

	test('Multiple Editors - Pinned & Non Active', function () {
		const group = createEditorGroupModel();

		const input1 = input();
		group.openEditor(input1);
		assert.strictEqual(group.activeEditor, input1);
		assert.strictEqual(group.previewEditor, input1);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input1);
		assert.strictEqual(group.count, 1);

		const input2 = input();
		group.openEditor(input2, { pinned: true, active: false });
		assert.strictEqual(group.activeEditor, input1);
		assert.strictEqual(group.previewEditor, input1);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input1);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input2);
		assert.strictEqual(group.count, 2);

		const input3 = input();
		group.openEditor(input3, { pinned: true, active: false });
		assert.strictEqual(group.activeEditor, input1);
		assert.strictEqual(group.previewEditor, input1);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input1);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input3);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[2], input2);
		assert.strictEqual(group.isPinned(input1), false);
		assert.strictEqual(group.isPinned(input2), true);
		assert.strictEqual(group.isPinned(input3), true);
		assert.strictEqual(group.count, 3);
	});

	test('Multiple Editors - Close Others, Close Left, Close Right', function () {
		const group = createEditorGroupModel();

		const input1 = input();
		const input2 = input();
		const input3 = input();
		const input4 = input();
		const input5 = input();

		group.openEditor(input1, { active: true, pinned: true });
		group.openEditor(input2, { active: true, pinned: true });
		group.openEditor(input3, { active: true, pinned: true });
		group.openEditor(input4, { active: true, pinned: true });
		group.openEditor(input5, { active: true, pinned: true });

		// Close Others
		closeEditors(group, group.activeEditor!);
		assert.strictEqual(group.activeEditor, input5);
		assert.strictEqual(group.count, 1);

		closeAllEditors(group);
		group.openEditor(input1, { active: true, pinned: true });
		group.openEditor(input2, { active: true, pinned: true });
		group.openEditor(input3, { active: true, pinned: true });
		group.openEditor(input4, { active: true, pinned: true });
		group.openEditor(input5, { active: true, pinned: true });
		group.setActive(input3);

		// Close Left
		assert.strictEqual(group.activeEditor, input3);
		closeEditors(group, group.activeEditor, CloseDirection.LEFT);
		assert.strictEqual(group.activeEditor, input3);
		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input3);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input4);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[2], input5);

		closeAllEditors(group);
		group.openEditor(input1, { active: true, pinned: true });
		group.openEditor(input2, { active: true, pinned: true });
		group.openEditor(input3, { active: true, pinned: true });
		group.openEditor(input4, { active: true, pinned: true });
		group.openEditor(input5, { active: true, pinned: true });
		group.setActive(input3);

		// Close Right
		assert.strictEqual(group.activeEditor, input3);
		closeEditors(group, group.activeEditor, CloseDirection.RIGHT);
		assert.strictEqual(group.activeEditor, input3);
		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input1);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input2);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[2], input3);
	});

	test('Multiple Editors - real user example', function () {
		const group = createEditorGroupModel();

		// [] -> /index.html/
		const indexHtml = input('index.html');
		let openedEditor = group.openEditor(indexHtml).editor;
		assert.strictEqual(openedEditor, indexHtml);
		assert.strictEqual(group.activeEditor, indexHtml);
		assert.strictEqual(group.previewEditor, indexHtml);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], indexHtml);
		assert.strictEqual(group.count, 1);

		// /index.html/ -> /index.html/
		const sameIndexHtml = input('index.html');
		openedEditor = group.openEditor(sameIndexHtml).editor;
		assert.strictEqual(openedEditor, indexHtml);
		assert.strictEqual(group.activeEditor, indexHtml);
		assert.strictEqual(group.previewEditor, indexHtml);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], indexHtml);
		assert.strictEqual(group.count, 1);

		// /index.html/ -> /style.css/
		const styleCss = input('style.css');
		openedEditor = group.openEditor(styleCss).editor;
		assert.strictEqual(openedEditor, styleCss);
		assert.strictEqual(group.activeEditor, styleCss);
		assert.strictEqual(group.previewEditor, styleCss);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], styleCss);
		assert.strictEqual(group.count, 1);

		// /style.css/ -> [/style.css/, test.js]
		const testJs = input('test.js');
		openedEditor = group.openEditor(testJs, { active: true, pinned: true }).editor;
		assert.strictEqual(openedEditor, testJs);
		assert.strictEqual(group.previewEditor, styleCss);
		assert.strictEqual(group.activeEditor, testJs);
		assert.strictEqual(group.isPinned(styleCss), false);
		assert.strictEqual(group.isPinned(testJs), true);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], styleCss);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], testJs);
		assert.strictEqual(group.count, 2);

		// [/style.css/, test.js] -> [test.js, /index.html/]
		const indexHtml2 = input('index.html');
		group.openEditor(indexHtml2, { active: true });
		assert.strictEqual(group.activeEditor, indexHtml2);
		assert.strictEqual(group.previewEditor, indexHtml2);
		assert.strictEqual(group.isPinned(indexHtml2), false);
		assert.strictEqual(group.isPinned(testJs), true);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], testJs);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], indexHtml2);
		assert.strictEqual(group.count, 2);

		// make test.js active
		const testJs2 = input('test.js');
		group.setActive(testJs2);
		assert.strictEqual(group.activeEditor, testJs);
		assert.strictEqual(group.isActive(testJs2), true);
		assert.strictEqual(group.count, 2);

		// [test.js, /indexHtml/] -> [test.js, index.html]
		const indexHtml3 = input('index.html');
		group.pin(indexHtml3);
		assert.strictEqual(group.isPinned(indexHtml3), true);
		assert.strictEqual(group.activeEditor, testJs);

		// [test.js, index.html] -> [test.js, file.ts, index.html]
		const fileTs = input('file.ts');
		group.openEditor(fileTs, { active: true, pinned: true });
		assert.strictEqual(group.isPinned(fileTs), true);
		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.activeEditor, fileTs);

		// [test.js, index.html, file.ts] -> [test.js, /file.ts/, index.html]
		group.unpin(fileTs);
		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.isPinned(fileTs), false);
		assert.strictEqual(group.activeEditor, fileTs);

		// [test.js, /file.ts/, index.html] -> [test.js, /other.ts/, index.html]
		const otherTs = input('other.ts');
		group.openEditor(otherTs, { active: true });
		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.activeEditor, otherTs);
		assert.ok(group.getEditors(EditorsOrder.SEQUENTIAL)[0].matches(testJs));
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], otherTs);
		assert.ok(group.getEditors(EditorsOrder.SEQUENTIAL)[2].matches(indexHtml));

		// make index.html active
		const indexHtml4 = input('index.html');
		group.setActive(indexHtml4);
		assert.strictEqual(group.activeEditor, indexHtml2);

		// [test.js, /other.ts/, index.html] -> [test.js, /other.ts/]
		group.closeEditor(indexHtml);
		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.activeEditor, otherTs);
		assert.ok(group.getEditors(EditorsOrder.SEQUENTIAL)[0].matches(testJs));
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], otherTs);

		// [test.js, /other.ts/] -> [test.js]
		group.closeEditor(otherTs);
		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.activeEditor, testJs);
		assert.ok(group.getEditors(EditorsOrder.SEQUENTIAL)[0].matches(testJs));

		// [test.js] -> /test.js/
		group.unpin(testJs);
		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.activeEditor, testJs);
		assert.ok(group.getEditors(EditorsOrder.SEQUENTIAL)[0].matches(testJs));
		assert.strictEqual(group.isPinned(testJs), false);

		// /test.js/ -> []
		group.closeEditor(testJs);
		assert.strictEqual(group.count, 0);
		assert.strictEqual(group.activeEditor, null);
		assert.strictEqual(group.previewEditor, null);
	});

	test('Single Group, Single Editor - persist', function () {
		const inst = new TestInstantiationService();

		inst.stub(IStorageService, disposables.add(new TestStorageService()));
		inst.stub(IWorkspaceContextService, new TestContextService());
		const lifecycle = disposables.add(new TestLifecycleService());
		inst.stub(ILifecycleService, lifecycle);
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'right' } });
		inst.stub(IConfigurationService, config);

		inst.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));

		let group = createEditorGroupModel();

		const input1 = input();
		group.openEditor(input1);

		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.activeEditor!.matches(input1), true);
		assert.strictEqual(group.previewEditor!.matches(input1), true);
		assert.strictEqual(group.isActive(input1), true);

		// Create model again - should load from storage
		group = disposables.add(inst.createInstance(EditorGroupModel, group.serialize()));

		assert.strictEqual(group.count, 1);
		assert.strictEqual(group.activeEditor!.matches(input1), true);
		assert.strictEqual(group.previewEditor!.matches(input1), true);
		assert.strictEqual(group.isActive(input1), true);
		inst.dispose();
	});

	test('Multiple Groups, Multiple editors - persist', function () {
		const inst = new TestInstantiationService();

		inst.stub(IStorageService, disposables.add(new TestStorageService()));
		inst.stub(IWorkspaceContextService, new TestContextService());
		const lifecycle = disposables.add(new TestLifecycleService());
		inst.stub(ILifecycleService, lifecycle);
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'right' } });
		inst.stub(IConfigurationService, config);

		inst.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));

		let group1 = createEditorGroupModel();

		const g1_input1 = input();
		const g1_input2 = input();
		const g1_input3 = input();

		group1.openEditor(g1_input1, { active: true, pinned: true });
		group1.openEditor(g1_input2, { active: true, pinned: false });
		group1.openEditor(g1_input3, { active: false, pinned: true });

		let group2 = createEditorGroupModel();

		const g2_input1 = input();
		const g2_input2 = input();
		const g2_input3 = input();

		group2.openEditor(g2_input1, { active: true, pinned: true });
		group2.openEditor(g2_input2, { active: false, pinned: false });
		group2.openEditor(g2_input3, { active: false, pinned: true });

		assert.strictEqual(group1.count, 3);
		assert.strictEqual(group2.count, 3);
		assert.strictEqual(group1.activeEditor!.matches(g1_input2), true);
		assert.strictEqual(group2.activeEditor!.matches(g2_input1), true);
		assert.strictEqual(group1.previewEditor!.matches(g1_input2), true);
		assert.strictEqual(group2.previewEditor!.matches(g2_input2), true);

		assert.strictEqual(group1.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].matches(g1_input2), true);
		assert.strictEqual(group1.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].matches(g1_input3), true);
		assert.strictEqual(group1.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[2].matches(g1_input1), true);

		assert.strictEqual(group2.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].matches(g2_input1), true);
		assert.strictEqual(group2.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].matches(g2_input3), true);
		assert.strictEqual(group2.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[2].matches(g2_input2), true);

		// Create model again - should load from storage
		group1 = disposables.add(inst.createInstance(EditorGroupModel, group1.serialize()));
		group2 = disposables.add(inst.createInstance(EditorGroupModel, group2.serialize()));

		assert.strictEqual(group1.count, 3);
		assert.strictEqual(group2.count, 3);
		assert.strictEqual(group1.activeEditor!.matches(g1_input2), true);
		assert.strictEqual(group2.activeEditor!.matches(g2_input1), true);
		assert.strictEqual(group1.previewEditor!.matches(g1_input2), true);
		assert.strictEqual(group2.previewEditor!.matches(g2_input2), true);

		assert.strictEqual(group1.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].matches(g1_input2), true);
		assert.strictEqual(group1.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].matches(g1_input3), true);
		assert.strictEqual(group1.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[2].matches(g1_input1), true);

		assert.strictEqual(group2.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].matches(g2_input1), true);
		assert.strictEqual(group2.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].matches(g2_input3), true);
		assert.strictEqual(group2.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[2].matches(g2_input2), true);
		inst.dispose();
	});

	test('Single group, multiple editors - persist (some not persistable)', function () {
		const inst = new TestInstantiationService();

		inst.stub(IStorageService, disposables.add(new TestStorageService()));
		inst.stub(IWorkspaceContextService, new TestContextService());
		const lifecycle = disposables.add(new TestLifecycleService());
		inst.stub(ILifecycleService, lifecycle);
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'right' } });
		inst.stub(IConfigurationService, config);

		inst.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));

		let group = createEditorGroupModel();

		const serializableInput1 = input();
		const nonSerializableInput2 = input('3', true);
		const serializableInput2 = input();

		group.openEditor(serializableInput1, { active: true, pinned: true });
		group.openEditor(nonSerializableInput2, { active: true, pinned: false });
		group.openEditor(serializableInput2, { active: false, pinned: true });

		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.activeEditor!.matches(nonSerializableInput2), true);
		assert.strictEqual(group.previewEditor!.matches(nonSerializableInput2), true);

		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].matches(nonSerializableInput2), true);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].matches(serializableInput2), true);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[2].matches(serializableInput1), true);

		// Create model again - should load from storage
		group = disposables.add(inst.createInstance(EditorGroupModel, group.serialize()));

		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.activeEditor!.matches(serializableInput2), true);
		assert.strictEqual(group.previewEditor, null);

		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].matches(serializableInput2), true);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].matches(serializableInput1), true);
		inst.dispose();
	});

	test('Single group, multiple editors - persist (some not persistable, sticky editors)', function () {
		const inst = new TestInstantiationService();

		inst.stub(IStorageService, disposables.add(new TestStorageService()));
		inst.stub(IWorkspaceContextService, new TestContextService());
		const lifecycle = disposables.add(new TestLifecycleService());
		inst.stub(ILifecycleService, lifecycle);
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'right' } });
		inst.stub(IConfigurationService, config);

		inst.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));

		let group = createEditorGroupModel();

		const serializableInput1 = input();
		const nonSerializableInput2 = input('3', true);
		const serializableInput2 = input();

		group.openEditor(serializableInput1, { active: true, pinned: true });
		group.openEditor(nonSerializableInput2, { active: true, pinned: true, sticky: true });
		group.openEditor(serializableInput2, { active: false, pinned: true });

		assert.strictEqual(group.count, 3);
		assert.strictEqual(group.stickyCount, 1);

		// Create model again - should load from storage
		group = disposables.add(inst.createInstance(EditorGroupModel, group.serialize()));

		assert.strictEqual(group.count, 2);
		assert.strictEqual(group.stickyCount, 0);
		inst.dispose();
	});

	test('Multiple groups, multiple editors - persist (some not persistable, causes empty group)', function () {
		const inst = new TestInstantiationService();

		inst.stub(IStorageService, disposables.add(new TestStorageService()));
		inst.stub(IWorkspaceContextService, new TestContextService());
		const lifecycle = disposables.add(new TestLifecycleService());
		inst.stub(ILifecycleService, lifecycle);
		inst.stub(ITelemetryService, NullTelemetryService);

		const config = new TestConfigurationService();
		config.setUserConfiguration('workbench', { editor: { openPositioning: 'right' } });
		inst.stub(IConfigurationService, config);

		inst.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));

		let group1 = createEditorGroupModel();
		let group2 = createEditorGroupModel();

		const serializableInput1 = input();
		const serializableInput2 = input();
		const nonSerializableInput = input('2', true);

		group1.openEditor(serializableInput1, { pinned: true });
		group1.openEditor(serializableInput2);

		group2.openEditor(nonSerializableInput);

		// Create model again - should load from storage
		group1 = disposables.add(inst.createInstance(EditorGroupModel, group1.serialize()));
		group2 = disposables.add(inst.createInstance(EditorGroupModel, group2.serialize()));

		assert.strictEqual(group1.count, 2);
		assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[0].matches(serializableInput1), true);
		assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[1].matches(serializableInput2), true);
		inst.dispose();
	});

	test('Multiple Editors - Editor Dispose', function () {
		const group1 = createEditorGroupModel();
		const group2 = createEditorGroupModel();

		const group1Listener = groupListener(group1);
		const group2Listener = groupListener(group2);

		const input1 = input();
		const input2 = input();
		const input3 = input();

		group1.openEditor(input1, { pinned: true, active: true });
		group1.openEditor(input2, { pinned: true, active: true });
		group1.openEditor(input3, { pinned: true, active: true });

		group2.openEditor(input1, { pinned: true, active: true });
		group2.openEditor(input2, { pinned: true, active: true });

		input1.dispose();

		assert.strictEqual(group1Listener.disposed.length, 1);
		assert.strictEqual(group1Listener.disposed[0].editorIndex, 0);
		assert.strictEqual(group2Listener.disposed.length, 1);
		assert.strictEqual(group2Listener.disposed[0].editorIndex, 0);
		assert.ok(group1Listener.disposed[0].editor.matches(input1));
		assert.ok(group2Listener.disposed[0].editor.matches(input1));

		input3.dispose();
		assert.strictEqual(group1Listener.disposed.length, 2);
		assert.strictEqual(group1Listener.disposed[1].editorIndex, 2);
		assert.strictEqual(group2Listener.disposed.length, 1);
		assert.ok(group1Listener.disposed[1].editor.matches(input3));
	});

	test('Preview tab does not have a stable position (https://github.com/microsoft/vscode/issues/8245)', function () {
		const group1 = createEditorGroupModel();

		const input1 = input();
		const input2 = input();
		const input3 = input();

		group1.openEditor(input1, { pinned: true, active: true });
		group1.openEditor(input2, { active: true });
		group1.setActive(input1);

		group1.openEditor(input3, { active: true });
		assert.strictEqual(group1.indexOf(input3), 1);
	});

	test('Multiple Editors - Editor Emits Dirty and Label Changed', function () {
		const group1 = createEditorGroupModel();
		const group2 = createEditorGroupModel();

		const input1 = input();
		const input2 = input();

		group1.openEditor(input1, { pinned: true, active: true });
		group2.openEditor(input2, { pinned: true, active: true });

		let dirty1Counter = 0;
		disposables.add(group1.onDidModelChange((e) => {
			if (e.kind === GroupModelChangeKind.EDITOR_DIRTY) {
				dirty1Counter++;
			}
		}));

		let dirty2Counter = 0;
		disposables.add(group2.onDidModelChange((e) => {
			if (e.kind === GroupModelChangeKind.EDITOR_DIRTY) {
				dirty2Counter++;
			}
		}));

		let label1ChangeCounter = 0;
		disposables.add(group1.onDidModelChange((e) => {
			if (e.kind === GroupModelChangeKind.EDITOR_LABEL) {
				label1ChangeCounter++;
			}
		}));

		let label2ChangeCounter = 0;
		disposables.add(group2.onDidModelChange((e) => {
			if (e.kind === GroupModelChangeKind.EDITOR_LABEL) {
				label2ChangeCounter++;
			}
		}));

		(<TestEditorInput>input1).setDirty();
		(<TestEditorInput>input1).setLabel();

		assert.strictEqual(dirty1Counter, 1);
		assert.strictEqual(label1ChangeCounter, 1);

		(<TestEditorInput>input2).setDirty();
		(<TestEditorInput>input2).setLabel();

		assert.strictEqual(dirty2Counter, 1);
		assert.strictEqual(label2ChangeCounter, 1);

		closeAllEditors(group2);

		(<TestEditorInput>input2).setDirty();
		(<TestEditorInput>input2).setLabel();

		assert.strictEqual(dirty2Counter, 1);
		assert.strictEqual(label2ChangeCounter, 1);
		assert.strictEqual(dirty1Counter, 1);
		assert.strictEqual(label1ChangeCounter, 1);
	});

	test('Sticky Editors', function () {
		const group = createEditorGroupModel();

		const input1 = input();
		const input2 = input();
		const input3 = input();
		const input4 = input();

		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: false, active: true });

		assert.strictEqual(group.stickyCount, 0);

		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 3);
		assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 3);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 3);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 3);

		// Stick last editor should move it first and pin
		group.stick(input3);
		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 2);
		assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: false }).length, 3);
		assert.strictEqual(group.isSticky(input1), false);
		assert.strictEqual(group.isSticky(input2), false);
		assert.strictEqual(group.isSticky(input3), true);
		assert.strictEqual(group.isPinned(input3), true);
		assert.strictEqual(group.indexOf(input1), 1);
		assert.strictEqual(group.indexOf(input2), 2);
		assert.strictEqual(group.indexOf(input3), 0);

		let sequentialAllEditors = group.getEditors(EditorsOrder.SEQUENTIAL);
		assert.strictEqual(sequentialAllEditors.length, 3);
		let sequentialEditorsExcludingSticky = group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true });
		assert.strictEqual(sequentialEditorsExcludingSticky.length, 2);
		assert.ok(sequentialEditorsExcludingSticky.indexOf(input1) >= 0);
		assert.ok(sequentialEditorsExcludingSticky.indexOf(input2) >= 0);
		let mruAllEditors = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
		assert.strictEqual(mruAllEditors.length, 3);
		let mruEditorsExcludingSticky = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true });
		assert.strictEqual(mruEditorsExcludingSticky.length, 2);
		assert.ok(mruEditorsExcludingSticky.indexOf(input1) >= 0);
		assert.ok(mruEditorsExcludingSticky.indexOf(input2) >= 0);

		// Sticking same editor again is a no-op
		group.stick(input3);
		assert.strictEqual(group.isSticky(input3), true);

		// Sticking last editor now should move it after sticky one
		group.stick(input2);
		assert.strictEqual(group.stickyCount, 2);
		assert.strictEqual(group.isSticky(input1), false);
		assert.strictEqual(group.isSticky(input2), true);
		assert.strictEqual(group.isSticky(input3), true);
		assert.strictEqual(group.indexOf(input1), 2);
		assert.strictEqual(group.indexOf(input2), 1);
		assert.strictEqual(group.indexOf(input3), 0);

		sequentialAllEditors = group.getEditors(EditorsOrder.SEQUENTIAL);
		assert.strictEqual(sequentialAllEditors.length, 3);
		sequentialEditorsExcludingSticky = group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true });
		assert.strictEqual(sequentialEditorsExcludingSticky.length, 1);
		assert.ok(sequentialEditorsExcludingSticky.indexOf(input1) >= 0);
		mruAllEditors = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
		assert.strictEqual(mruAllEditors.length, 3);
		mruEditorsExcludingSticky = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true });
		assert.strictEqual(mruEditorsExcludingSticky.length, 1);
		assert.ok(mruEditorsExcludingSticky.indexOf(input1) >= 0);

		// Sticking remaining editor also works
		group.stick(input1);
		assert.strictEqual(group.stickyCount, 3);
		assert.strictEqual(group.isSticky(input1), true);
		assert.strictEqual(group.isSticky(input2), true);
		assert.strictEqual(group.isSticky(input3), true);
		assert.strictEqual(group.indexOf(input1), 2);
		assert.strictEqual(group.indexOf(input2), 1);
		assert.strictEqual(group.indexOf(input3), 0);

		sequentialAllEditors = group.getEditors(EditorsOrder.SEQUENTIAL);
		assert.strictEqual(sequentialAllEditors.length, 3);
		sequentialEditorsExcludingSticky = group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true });
		assert.strictEqual(sequentialEditorsExcludingSticky.length, 0);
		mruAllEditors = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
		assert.strictEqual(mruAllEditors.length, 3);
		mruEditorsExcludingSticky = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true });
		assert.strictEqual(mruEditorsExcludingSticky.length, 0);

		// Unsticking moves editor after sticky ones
		group.unstick(input3);
		assert.strictEqual(group.stickyCount, 2);
		assert.strictEqual(group.isSticky(input1), true);
		assert.strictEqual(group.isSticky(input2), true);
		assert.strictEqual(group.isSticky(input3), false);
		assert.strictEqual(group.indexOf(input1), 1);
		assert.strictEqual(group.indexOf(input2), 0);
		assert.strictEqual(group.indexOf(input3), 2);

		// Unsticking all works
		group.unstick(input1);
		group.unstick(input2);
		assert.strictEqual(group.stickyCount, 0);
		assert.strictEqual(group.isSticky(input1), false);
		assert.strictEqual(group.isSticky(input2), false);
		assert.strictEqual(group.isSticky(input3), false);

		group.moveEditor(input1, 0);
		group.moveEditor(input2, 1);
		group.moveEditor(input3, 2);

		// Opening a new editor always opens after sticky editors
		group.stick(input1);
		group.stick(input2);
		group.setActive(input1);

		const events = groupListener(group);

		group.openEditor(input4, { pinned: true, active: true });
		assert.strictEqual(group.indexOf(input4), 2);
		group.closeEditor(input4);

		assert.strictEqual(events.closed[0].sticky, false);

		group.setActive(input2);

		group.openEditor(input4, { pinned: true, active: true });
		assert.strictEqual(group.indexOf(input4), 2);
		group.closeEditor(input4);

		assert.strictEqual(events.closed[1].sticky, false);

		// Reset
		assert.strictEqual(group.stickyCount, 2);
		assert.strictEqual(group.isSticky(input1), true);
		assert.strictEqual(group.isSticky(input2), true);
		assert.strictEqual(group.isSticky(input3), false);
		assert.strictEqual(group.indexOf(input1), 0);
		assert.strictEqual(group.indexOf(input2), 1);
		assert.strictEqual(group.indexOf(input3), 2);

		// Moving a sticky editor works
		group.moveEditor(input1, 1); // still moved within sticky range
		assert.strictEqual(group.isSticky(input1), true);
		assert.strictEqual(group.isSticky(input2), true);
		assert.strictEqual(group.isSticky(input3), false);
		assert.strictEqual(group.indexOf(input1), 1);
		assert.strictEqual(group.indexOf(input2), 0);
		assert.strictEqual(group.indexOf(input3), 2);

		group.moveEditor(input1, 0); // still moved within sticky range
		assert.strictEqual(group.isSticky(input1), true);
		assert.strictEqual(group.isSticky(input2), true);
		assert.strictEqual(group.isSticky(input3), false);
		assert.strictEqual(group.indexOf(input1), 0);
		assert.strictEqual(group.indexOf(input2), 1);
		assert.strictEqual(group.indexOf(input3), 2);

		group.moveEditor(input1, 2); // moved out of sticky range//
		assert.strictEqual(group.isSticky(input1), false);
		assert.strictEqual(group.isSticky(input2), true);
		assert.strictEqual(group.isSticky(input3), false);
		assert.strictEqual(group.indexOf(input1), 2);
		assert.strictEqual(group.indexOf(input2), 0);
		assert.strictEqual(group.indexOf(input3), 1);

		group.moveEditor(input2, 2); // moved out of sticky range
		assert.strictEqual(group.isSticky(input1), false);
		assert.strictEqual(group.isSticky(input2), false);
		assert.strictEqual(group.isSticky(input3), false);
		assert.strictEqual(group.indexOf(input1), 1);
		assert.strictEqual(group.indexOf(input2), 2);
		assert.strictEqual(group.indexOf(input3), 0);

		// Reset
		group.moveEditor(input1, 0);
		group.moveEditor(input2, 1);
		group.moveEditor(input3, 2);
		group.stick(input1);
		group.unstick(input2);
		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.isSticky(input1), true);
		assert.strictEqual(group.isSticky(input2), false);
		assert.strictEqual(group.isSticky(input3), false);
		assert.strictEqual(group.indexOf(input1), 0);
		assert.strictEqual(group.indexOf(input2), 1);
		assert.strictEqual(group.indexOf(input3), 2);

		// Moving a unsticky editor in works
		group.moveEditor(input3, 1); // still moved within unsticked range
		assert.strictEqual(group.isSticky(input1), true);
		assert.strictEqual(group.isSticky(input2), false);
		assert.strictEqual(group.isSticky(input3), false);
		assert.strictEqual(group.indexOf(input1), 0);
		assert.strictEqual(group.indexOf(input2), 2);
		assert.strictEqual(group.indexOf(input3), 1);

		group.moveEditor(input3, 2); // still moved within unsticked range
		assert.strictEqual(group.isSticky(input1), true);
		assert.strictEqual(group.isSticky(input2), false);
		assert.strictEqual(group.isSticky(input3), false);
		assert.strictEqual(group.indexOf(input1), 0);
		assert.strictEqual(group.indexOf(input2), 1);
		assert.strictEqual(group.indexOf(input3), 2);

		group.moveEditor(input3, 0); // moved into sticky range//
		assert.strictEqual(group.isSticky(input1), true);
		assert.strictEqual(group.isSticky(input2), false);
		assert.strictEqual(group.isSticky(input3), true);
		assert.strictEqual(group.indexOf(input1), 1);
		assert.strictEqual(group.indexOf(input2), 2);
		assert.strictEqual(group.indexOf(input3), 0);

		group.moveEditor(input2, 0); // moved into sticky range
		assert.strictEqual(group.isSticky(input1), true);
		assert.strictEqual(group.isSticky(input2), true);
		assert.strictEqual(group.isSticky(input3), true);
		assert.strictEqual(group.indexOf(input1), 2);
		assert.strictEqual(group.indexOf(input2), 0);
		assert.strictEqual(group.indexOf(input3), 1);

		// Closing a sticky editor updates state properly
		group.stick(input1);
		group.stick(input2);
		group.unstick(input3);
		assert.strictEqual(group.stickyCount, 2);
		group.closeEditor(input1);
		assert.strictEqual(events.closed[2].sticky, true);
		assert.strictEqual(group.stickyCount, 1);
		group.closeEditor(input2);
		assert.strictEqual(events.closed[3].sticky, true);
		assert.strictEqual(group.stickyCount, 0);

		closeAllEditors(group);
		assert.strictEqual(group.stickyCount, 0);

		// Open sticky
		group.openEditor(input1, { sticky: true });
		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.isSticky(input1), true);

		group.openEditor(input2, { pinned: true, active: true });
		assert.strictEqual(group.stickyCount, 1);
		assert.strictEqual(group.isSticky(input1), true);
		assert.strictEqual(group.isSticky(input2), false);

		group.openEditor(input2, { sticky: true });
		assert.strictEqual(group.stickyCount, 2);
		assert.strictEqual(group.isSticky(input1), true);
		assert.strictEqual(group.isSticky(input2), true);

		group.openEditor(input3, { pinned: true, active: true });
		group.openEditor(input4, { pinned: false, active: true, sticky: true });
		assert.strictEqual(group.stickyCount, 3);
		assert.strictEqual(group.isSticky(input1), true);
		assert.strictEqual(group.isSticky(input2), true);
		assert.strictEqual(group.isSticky(input3), false);
		assert.strictEqual(group.isSticky(input4), true);
		assert.strictEqual(group.isPinned(input4), true);

		assert.strictEqual(group.indexOf(input1), 0);
		assert.strictEqual(group.indexOf(input2), 1);
		assert.strictEqual(group.indexOf(input3), 3);
		assert.strictEqual(group.indexOf(input4), 2);
	});

	test('Sticky/Unsticky Editors sends correct editor index', function () {
		const group = createEditorGroupModel();

		const input1 = input();
		const input2 = input();
		const input3 = input();

		group.openEditor(input1, { pinned: true, active: true });
		group.openEditor(input2, { pinned: true, active: true });
		group.openEditor(input3, { pinned: false, active: true });

		assert.strictEqual(group.stickyCount, 0);

		const events = groupListener(group);

		group.stick(input3);

		assert.strictEqual(events.sticky[0].editorIndex, 0);
		assert.strictEqual(group.isSticky(input3), true);
		assert.strictEqual(group.stickyCount, 1);

		group.stick(input2);

		assert.strictEqual(events.sticky[1].editorIndex, 1);
		assert.strictEqual(group.isSticky(input2), true);
		assert.strictEqual(group.stickyCount, 2);

		group.unstick(input3);
		assert.strictEqual(events.unsticky[0].editorIndex, 1);
		assert.strictEqual(group.isSticky(input3), false);
		assert.strictEqual(group.isSticky(input2), true);
		assert.strictEqual(group.stickyCount, 1);
	});

	test('onDidMoveEditor Event', () => {
		const group1 = createEditorGroupModel();
		const group2 = createEditorGroupModel();

		const input1group1 = input();
		const input2group1 = input();
		const input1group2 = input();
		const input2group2 = input();

		// Open all the editors
		group1.openEditor(input1group1, { pinned: true, active: true, index: 0 });
		group1.openEditor(input2group1, { pinned: true, active: false, index: 1 });
		group2.openEditor(input1group2, { pinned: true, active: true, index: 0 });
		group2.openEditor(input2group2, { pinned: true, active: false, index: 1 });

		const group1Events = groupListener(group1);
		const group2Events = groupListener(group2);

		group1.moveEditor(input1group1, 1);
		assert.strictEqual(group1Events.moved[0].editor, input1group1);
		assert.strictEqual(group1Events.moved[0].oldEditorIndex, 0);
		assert.strictEqual(group1Events.moved[0].editorIndex, 1);

		group2.moveEditor(input1group2, 1);
		assert.strictEqual(group2Events.moved[0].editor, input1group2);
		assert.strictEqual(group2Events.moved[0].oldEditorIndex, 0);
		assert.strictEqual(group2Events.moved[0].editorIndex, 1);
	});

	test('onDidOpeneditor Event', () => {
		const group1 = createEditorGroupModel();
		const group2 = createEditorGroupModel();

		const group1Events = groupListener(group1);
		const group2Events = groupListener(group2);

		const input1group1 = input();
		const input2group1 = input();
		const input1group2 = input();
		const input2group2 = input();

		// Open all the editors
		group1.openEditor(input1group1, { pinned: true, active: true, index: 0 });
		group1.openEditor(input2group1, { pinned: true, active: false, index: 1 });
		group2.openEditor(input1group2, { pinned: true, active: true, index: 0 });
		group2.openEditor(input2group2, { pinned: true, active: false, index: 1 });

		assert.strictEqual(group1Events.opened.length, 2);
		assert.strictEqual(group1Events.opened[0].editor, input1group1);
		assert.strictEqual(group1Events.opened[0].editorIndex, 0);
		assert.strictEqual(group1Events.opened[1].editor, input2group1);
		assert.strictEqual(group1Events.opened[1].editorIndex, 1);

		assert.strictEqual(group2Events.opened.length, 2);
		assert.strictEqual(group2Events.opened[0].editor, input1group2);
		assert.strictEqual(group2Events.opened[0].editorIndex, 0);
		assert.strictEqual(group2Events.opened[1].editor, input2group2);
		assert.strictEqual(group2Events.opened[1].editorIndex, 1);
	});

	test('moving editor sends sticky event when sticky changes', () => {
		const group1 = createEditorGroupModel();

		const input1group1 = input();
		const input2group1 = input();
		const input3group1 = input();

		// Open all the editors
		group1.openEditor(input1group1, { pinned: true, active: true, index: 0, sticky: true });
		group1.openEditor(input2group1, { pinned: true, active: false, index: 1 });
		group1.openEditor(input3group1, { pinned: true, active: false, index: 2 });

		const group1Events = groupListener(group1);

		group1.moveEditor(input2group1, 0);
		assert.strictEqual(group1Events.sticky[0].editor, input2group1);
		assert.strictEqual(group1Events.sticky[0].editorIndex, 0);

		const group2 = createEditorGroupModel();

		const input1group2 = input();
		const input2group2 = input();
		const input3group2 = input();

		// Open all the editors
		group2.openEditor(input1group2, { pinned: true, active: true, index: 0, sticky: true });
		group2.openEditor(input2group2, { pinned: true, active: false, index: 1 });
		group2.openEditor(input3group2, { pinned: true, active: false, index: 2 });

		const group2Events = groupListener(group2);

		group2.moveEditor(input1group2, 1);
		assert.strictEqual(group2Events.unsticky[0].editor, input1group2);
		assert.strictEqual(group2Events.unsticky[0].editorIndex, 1);
	});

	function assertSelection(group: EditorGroupModel, activeEditor: EditorInput, selectedEditors: EditorInput[]): void {
		assert.strictEqual(group.activeEditor, activeEditor);
		assert.strictEqual(group.selectedEditors.length, selectedEditors.length);
		for (let i = 0; i < selectedEditors.length; i++) {
			assert.strictEqual(group.selectedEditors[i], selectedEditors[i]);
		}
	}

	test('editor selection: selectedEditors', () => {
		const group = createEditorGroupModel();

		const activeEditor = group.activeEditor;
		const selectedEditors = group.selectedEditors;
		assert.strictEqual(activeEditor, null);
		assert.strictEqual(selectedEditors.length, 0);

		// active editor: input1, selection: [input1]
		const input1 = input();
		group.openEditor(input1, { pinned: true, active: true, index: 0 });
		assertSelection(group, input1, [input1]);

		// active editor: input3, selection: [input3]
		const input2 = input();
		const input3 = input();
		group.openEditor(input2, { pinned: true, active: true, index: 1 });
		group.openEditor(input3, { pinned: true, active: true, index: 2 });
		assertSelection(group, input3, [input3]);

		// active editor: input2, selection: [input1, input2] (in sequential order)
		group.setSelection(input2, [input1]);
		assertSelection(group, input2, [input1, input2]);
	});

	test('editor selection: openEditor with inactive selection', () => {
		const group = createEditorGroupModel();

		// active editor: input3, selection: [input3]
		const input1 = input();
		const input2 = input();
		const input3 = input();
		group.openEditor(input1, { pinned: true, active: true, index: 0 });
		group.openEditor(input2, { pinned: true, active: true, index: 1 });
		group.openEditor(input3, { pinned: true, active: true, index: 2 });

		// active editor: input2, selection: [input1, input2, input3] (in sequential order)
		group.openEditor(input2, { active: true, inactiveSelection: [input3, input1] });
		assertSelection(group, input2, [input1, input2, input3]);

		// active editor: input1, selection: [input1, input3] (in sequential order)
		// test duplicate entries
		group.openEditor(input1, { active: true, inactiveSelection: [input3, input1, input3] });
		assertSelection(group, input1, [input1, input3]);

		// active editor: input1, selection: [input1, input2] (in sequential order)
		// open new Editor as inactive with selection
		const input4 = input();
		group.openEditor(input4, { pinned: true, active: false, inactiveSelection: [input2], index: 3 });
		assertSelection(group, input1, [input1, input2]);

		// active editor: input5, selection: [input4, input5] (in sequential order)
		// open new Editor as active with selection
		const input5 = input();
		group.openEditor(input5, { pinned: true, active: true, inactiveSelection: [input4], index: 4 });
		assertSelection(group, input5, [input4, input5]);
	});

	test('editor selection: closeEditor keeps selection', () => {
		const group = createEditorGroupModel();

		// active editor: input3, selection: [input3]
		const input1 = input();
		const input2 = input();
		const input3 = input();
		group.openEditor(input1, { pinned: true, active: true, index: 0 });
		group.openEditor(input2, { pinned: true, active: true, index: 1 });
		group.openEditor(input3, { pinned: true, active: true, index: 2 });

		group.setSelection(input2, [input3, input1]);
		group.closeEditor(input3);
		assertSelection(group, input2, [input1, input2]);
	});

	test('editor selection: setSeletion', () => {
		const group = createEditorGroupModel();

		// active editor: input3, selection: [input3]
		const input1 = input();
		const input2 = input();
		const input3 = input();
		group.openEditor(input1, { pinned: true, active: true, index: 0 });
		group.openEditor(input2, { pinned: true, active: true, index: 1 });
		group.openEditor(input3, { pinned: true, active: true, index: 2 });

		// active editor: input2, selection: [input1, input2, input3] (in sequential order)
		group.setSelection(input2, [input3, input1]);
		assertSelection(group, input2, [input1, input2, input3]);

		// active editor: input3, selection: [input3]
		group.setSelection(input3, []);
		assertSelection(group, input3, [input3]);

		// active editor: input2, selection: [input1, input2]
		// test duplicate entries
		group.setSelection(input2, [input1, input2, input1]);
		assertSelection(group, input2, [input1, input2]);
	});

	test('editor selection: isSelected', () => {
		const group = createEditorGroupModel();

		// active editor: input3, selection: [input3]
		const input1 = input();
		const input2 = input();
		const input3 = input();
		group.openEditor(input1, { pinned: true, active: true, index: 0 });
		group.openEditor(input2, { pinned: true, active: true, index: 1 });
		group.openEditor(input3, { pinned: true, active: true, index: 2 });

		// active editor: input2, selection: [input1, input2, input3] (in sequential order)
		group.setSelection(input2, [input3, input1]);

		assert.strictEqual(group.isSelected(input1), true);
		assert.strictEqual(group.isSelected(input2), true);
		assert.strictEqual(group.isSelected(input3), true);

		// active editor: input3, selection: [input3]
		group.setSelection(input3, []);

		assert.strictEqual(group.isSelected(input1), false);
		assert.strictEqual(group.isSelected(input2), false);
		assert.strictEqual(group.isSelected(input3), true);

		// use index
		assert.strictEqual(group.isSelected(0), false);
		assert.strictEqual(group.isSelected(1), false);
		assert.strictEqual(group.isSelected(2), true);
	});

	test('editor selection: select invalid editor', () => {
		const group = createEditorGroupModel();

		const input1 = input();
		const input2 = input();
		group.openEditor(input1, { pinned: true, active: true, index: 0 });

		group.setSelection(input2, [input1]);

		assert.strictEqual(group.activeEditor, input1);
		assert.strictEqual(group.selectedEditors.length, 1);
		assert.strictEqual(group.isSelected(input1), true);
		assert.strictEqual(group.isSelected(input1), true);
		assert.strictEqual(group.isSelected(input2), false);

		group.setSelection(input1, [input2]);

		assert.strictEqual(group.activeEditor, input1);
		assert.strictEqual(group.selectedEditors.length, 1);
		assert.strictEqual(group.isSelected(input1), true);
		assert.strictEqual(group.isSelected(input1), true);
		assert.strictEqual(group.isSelected(input2), false);
	});

	test('editor transient: basics', () => {
		const group = createEditorGroupModel();
		const events = groupListener(group);

		const input1 = input();
		const input2 = input();
		group.openEditor(input1, { pinned: true, active: true });

		assert.strictEqual(group.isTransient(input1), false);
		assert.strictEqual(events.transient.length, 0);

		group.openEditor(input2, { pinned: true, active: true, transient: true });
		assert.strictEqual(events.transient[0].editor, input2);

		assert.strictEqual(group.isTransient(input2), true);

		group.setTransient(input1, true);
		assert.strictEqual(group.isTransient(input1), true);
		assert.strictEqual(events.transient[1].editor, input1);

		group.setTransient(input2, false);
		assert.strictEqual(group.isTransient(input2), false);
		assert.strictEqual(events.transient[2].editor, input2);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
