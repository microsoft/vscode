/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EditorGroupModel, ISerializedEditorGroupModel } from '../../../../common/editor/editorGroupModel.js';
import { EditorExtensions, IEditorFactoryRegistry, IFileEditorInput, IEditorSerializer, EditorsOrder, GroupModelChangeKind } from '../../../../common/editor.js';
import { URI } from '../../../../../base/common/uri.js';
import { TestLifecycleService } from '../../workbenchTestServices.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { TestContextService, TestStorageService } from '../../../common/workbenchTestServices.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StickyEditorGroupModel, UnstickyEditorGroupModel, TypeFilteredEditorGroupModel, EditorTypeGroupFilter } from '../../../../common/editor/filteredEditorGroupModel.js';

suite('FilteredEditorGroupModel', () => {

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

	function closeAllEditors(group: EditorGroupModel): void {
		for (const editor of group.getEditors(EditorsOrder.SEQUENTIAL)) {
			group.closeEditor(editor, undefined, false);
		}
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

	test('Sticky/Unsticky count', async () => {

		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();

		model.openEditor(input1, { pinned: true, sticky: true });
		model.openEditor(input2, { pinned: true, sticky: true });


		assert.strictEqual(stickyFilteredEditorGroup.count, 2);
		assert.strictEqual(unstickyFilteredEditorGroup.count, 0);

		model.unstick(input1);

		assert.strictEqual(stickyFilteredEditorGroup.count, 1);
		assert.strictEqual(unstickyFilteredEditorGroup.count, 1);

		model.unstick(input2);

		assert.strictEqual(stickyFilteredEditorGroup.count, 0);
		assert.strictEqual(unstickyFilteredEditorGroup.count, 2);
	});

	test('Sticky/Unsticky stickyCount', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();

		model.openEditor(input1, { pinned: true, sticky: true });
		model.openEditor(input2, { pinned: true, sticky: true });


		assert.strictEqual(stickyFilteredEditorGroup.stickyCount, 2);
		assert.strictEqual(unstickyFilteredEditorGroup.stickyCount, 0);

		model.unstick(input1);

		assert.strictEqual(stickyFilteredEditorGroup.stickyCount, 1);
		assert.strictEqual(unstickyFilteredEditorGroup.stickyCount, 0);

		model.unstick(input2);

		assert.strictEqual(stickyFilteredEditorGroup.stickyCount, 0);
		assert.strictEqual(unstickyFilteredEditorGroup.stickyCount, 0);
	});

	test('Sticky/Unsticky isEmpty', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();

		model.openEditor(input1, { pinned: true, sticky: false });
		model.openEditor(input2, { pinned: true, sticky: false });


		assert.strictEqual(stickyFilteredEditorGroup.count === 0, true);
		assert.strictEqual(unstickyFilteredEditorGroup.count === 0, false);

		model.stick(input1);

		assert.strictEqual(stickyFilteredEditorGroup.count === 0, false);
		assert.strictEqual(unstickyFilteredEditorGroup.count === 0, false);

		model.stick(input2);

		assert.strictEqual(stickyFilteredEditorGroup.count === 0, false);
		assert.strictEqual(unstickyFilteredEditorGroup.count === 0, true);
	});

	test('Sticky/Unsticky editors', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();

		model.openEditor(input1, { pinned: true, sticky: true });
		model.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 0);

		model.unstick(input1);

		assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 1);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 1);

		assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL)[0], input2);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL)[0], input1);

		model.unstick(input2);

		assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
	});

	test('Sticky/Unsticky activeEditor', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();

		model.openEditor(input1, { pinned: true, sticky: true, active: true });

		assert.strictEqual(stickyFilteredEditorGroup.activeEditor, input1);
		assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, null);

		model.openEditor(input2, { pinned: true, sticky: false, active: true });

		assert.strictEqual(stickyFilteredEditorGroup.activeEditor, null);
		assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, input2);

		model.closeEditor(input1);

		assert.strictEqual(stickyFilteredEditorGroup.activeEditor, null);
		assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, input2);

		model.closeEditor(input2);

		assert.strictEqual(stickyFilteredEditorGroup.activeEditor, null);
		assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, null);
	});

	test('Sticky/Unsticky previewEditor', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();

		model.openEditor(input1);

		assert.strictEqual(stickyFilteredEditorGroup.previewEditor, null);
		assert.strictEqual(unstickyFilteredEditorGroup.previewEditor, input1);

		model.openEditor(input2, { sticky: true });
		assert.strictEqual(stickyFilteredEditorGroup.previewEditor, null);
		assert.strictEqual(unstickyFilteredEditorGroup.previewEditor, input1);
	});

	test('Sticky/Unsticky isSticky()', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();

		model.openEditor(input1, { pinned: true, sticky: true });
		model.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.isSticky(input1), true);
		assert.strictEqual(stickyFilteredEditorGroup.isSticky(input2), true);

		model.unstick(input1);
		model.closeEditor(input1);
		model.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(unstickyFilteredEditorGroup.isSticky(input1), false);
		assert.strictEqual(unstickyFilteredEditorGroup.isSticky(input2), false);
	});

	test('Sticky/Unsticky isPinned()', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();
		const input3 = input();
		const input4 = input();

		model.openEditor(input1, { pinned: true, sticky: true });
		model.openEditor(input2, { pinned: true, sticky: false });
		model.openEditor(input3, { pinned: false, sticky: true });
		model.openEditor(input4, { pinned: false, sticky: false });

		assert.strictEqual(stickyFilteredEditorGroup.isPinned(input1), true);
		assert.strictEqual(unstickyFilteredEditorGroup.isPinned(input2), true);
		assert.strictEqual(stickyFilteredEditorGroup.isPinned(input3), true);
		assert.strictEqual(unstickyFilteredEditorGroup.isPinned(input4), false);
	});

	test('Sticky/Unsticky isActive()', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();

		model.openEditor(input1, { pinned: true, sticky: true, active: true });

		assert.strictEqual(stickyFilteredEditorGroup.isActive(input1), true);

		model.openEditor(input2, { pinned: true, sticky: false, active: true });

		assert.strictEqual(stickyFilteredEditorGroup.isActive(input1), false);
		assert.strictEqual(unstickyFilteredEditorGroup.isActive(input2), true);

		model.unstick(input1);

		assert.strictEqual(unstickyFilteredEditorGroup.isActive(input1), false);
		assert.strictEqual(unstickyFilteredEditorGroup.isActive(input2), true);
	});

	test('Sticky/Unsticky getEditors()', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();

		model.openEditor(input1, { pinned: true, sticky: true, active: true });
		model.openEditor(input2, { pinned: true, sticky: true, active: true });

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

		assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0], input2);
		assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1], input1);

		model.unstick(input1);

		assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 1);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 1);

		assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0], input2);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL)[0], input1);

		model.unstick(input2);

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

	test('Sticky/Unsticky getEditorByIndex()', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();
		const input3 = input();

		model.openEditor(input1, { pinned: true, sticky: true });
		model.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(0), input1);
		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(1), input2);
		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(2), undefined);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(0), undefined);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(1), undefined);

		model.openEditor(input3, { pinned: true, sticky: false });

		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(0), input1);
		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(1), input2);
		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(2), undefined);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(0), input3);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(1), undefined);

		model.unstick(input1);

		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(0), input2);
		assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(1), undefined);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(0), input1);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(1), input3);
		assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(2), undefined);
	});

	test('Sticky/Unsticky indexOf()', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();
		const input3 = input();

		model.openEditor(input1, { pinned: true, sticky: true });
		model.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.indexOf(input1), 0);
		assert.strictEqual(stickyFilteredEditorGroup.indexOf(input2), 1);
		assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input1), -1);
		assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input2), -1);

		model.openEditor(input3, { pinned: true, sticky: false });

		assert.strictEqual(stickyFilteredEditorGroup.indexOf(input1), 0);
		assert.strictEqual(stickyFilteredEditorGroup.indexOf(input2), 1);
		assert.strictEqual(stickyFilteredEditorGroup.indexOf(input3), -1);
		assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input1), -1);
		assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input2), -1);
		assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input3), 0);

		model.unstick(input1);

		assert.strictEqual(stickyFilteredEditorGroup.indexOf(input1), -1);
		assert.strictEqual(stickyFilteredEditorGroup.indexOf(input2), 0);
		assert.strictEqual(stickyFilteredEditorGroup.indexOf(input3), -1);
		assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input1), 0);
		assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input2), -1);
		assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input3), 1);
	});

	test('Sticky/Unsticky isFirst()', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();

		model.openEditor(input1, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.isFirst(input1), true);

		model.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.isFirst(input1), true);
		assert.strictEqual(stickyFilteredEditorGroup.isFirst(input2), false);

		model.unstick(input1);

		assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input1), true);
		assert.strictEqual(stickyFilteredEditorGroup.isFirst(input2), true);

		model.unstick(input2);

		assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input1), false);
		assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input2), true);

		model.moveEditor(input2, 1);

		assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input1), true);
		assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input2), false);
	});

	test('Sticky/Unsticky isLast()', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();

		model.openEditor(input1, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.isLast(input1), true);

		model.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.isLast(input1), false);
		assert.strictEqual(stickyFilteredEditorGroup.isLast(input2), true);

		model.unstick(input1);

		assert.strictEqual(unstickyFilteredEditorGroup.isLast(input1), true);
		assert.strictEqual(stickyFilteredEditorGroup.isLast(input2), true);

		model.unstick(input2);

		assert.strictEqual(unstickyFilteredEditorGroup.isLast(input1), true);
		assert.strictEqual(unstickyFilteredEditorGroup.isLast(input2), false);

		model.moveEditor(input2, 1);

		assert.strictEqual(unstickyFilteredEditorGroup.isLast(input1), false);
		assert.strictEqual(unstickyFilteredEditorGroup.isLast(input2), true);
	});

	test('Sticky/Unsticky contains()', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();

		model.openEditor(input1, { pinned: true, sticky: true });
		model.openEditor(input2, { pinned: true, sticky: true });

		assert.strictEqual(stickyFilteredEditorGroup.contains(input1), true);
		assert.strictEqual(stickyFilteredEditorGroup.contains(input2), true);

		assert.strictEqual(unstickyFilteredEditorGroup.contains(input1), false);
		assert.strictEqual(unstickyFilteredEditorGroup.contains(input2), false);

		model.unstick(input1);

		assert.strictEqual(stickyFilteredEditorGroup.contains(input1), false);
		assert.strictEqual(stickyFilteredEditorGroup.contains(input2), true);

		assert.strictEqual(unstickyFilteredEditorGroup.contains(input1), true);
		assert.strictEqual(unstickyFilteredEditorGroup.contains(input2), false);

		model.unstick(input2);

		assert.strictEqual(stickyFilteredEditorGroup.contains(input1), false);
		assert.strictEqual(stickyFilteredEditorGroup.contains(input2), false);

		assert.strictEqual(unstickyFilteredEditorGroup.contains(input1), true);
		assert.strictEqual(unstickyFilteredEditorGroup.contains(input2), true);
	});

	test('Sticky/Unsticky group information', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		// same id
		assert.strictEqual(stickyFilteredEditorGroup.id, model.id);
		assert.strictEqual(unstickyFilteredEditorGroup.id, model.id);

		// group locking same behaviour
		assert.strictEqual(stickyFilteredEditorGroup.isLocked, model.isLocked);
		assert.strictEqual(unstickyFilteredEditorGroup.isLocked, model.isLocked);

		model.lock(true);

		assert.strictEqual(stickyFilteredEditorGroup.isLocked, model.isLocked);
		assert.strictEqual(unstickyFilteredEditorGroup.isLocked, model.isLocked);

		model.lock(false);

		assert.strictEqual(stickyFilteredEditorGroup.isLocked, model.isLocked);
		assert.strictEqual(unstickyFilteredEditorGroup.isLocked, model.isLocked);
	});

	test('Multiple Editors - Editor Emits Dirty and Label Changed', function () {
		const model1 = createEditorGroupModel();
		const model2 = createEditorGroupModel();

		const stickyFilteredEditorGroup1 = disposables.add(new StickyEditorGroupModel(model1));
		const unstickyFilteredEditorGroup1 = disposables.add(new UnstickyEditorGroupModel(model1));
		const stickyFilteredEditorGroup2 = disposables.add(new StickyEditorGroupModel(model2));
		const unstickyFilteredEditorGroup2 = disposables.add(new UnstickyEditorGroupModel(model2));

		const input1 = input();
		const input2 = input();

		model1.openEditor(input1, { pinned: true, active: true });
		model2.openEditor(input2, { pinned: true, active: true, sticky: true });

		// DIRTY
		let dirty1CounterSticky = 0;
		disposables.add(stickyFilteredEditorGroup1.onDidModelChange((e) => {
			if (e.kind === GroupModelChangeKind.EDITOR_DIRTY) {
				dirty1CounterSticky++;
			}
		}));

		let dirty1CounterUnsticky = 0;
		disposables.add(unstickyFilteredEditorGroup1.onDidModelChange((e) => {
			if (e.kind === GroupModelChangeKind.EDITOR_DIRTY) {
				dirty1CounterUnsticky++;
			}
		}));

		let dirty2CounterSticky = 0;
		disposables.add(stickyFilteredEditorGroup2.onDidModelChange((e) => {
			if (e.kind === GroupModelChangeKind.EDITOR_DIRTY) {
				dirty2CounterSticky++;
			}
		}));

		let dirty2CounterUnsticky = 0;
		disposables.add(unstickyFilteredEditorGroup2.onDidModelChange((e) => {
			if (e.kind === GroupModelChangeKind.EDITOR_DIRTY) {
				dirty2CounterUnsticky++;
			}
		}));

		// LABEL
		let label1ChangeCounterSticky = 0;
		disposables.add(stickyFilteredEditorGroup1.onDidModelChange((e) => {
			if (e.kind === GroupModelChangeKind.EDITOR_LABEL) {
				label1ChangeCounterSticky++;
			}
		}));

		let label1ChangeCounterUnsticky = 0;
		disposables.add(unstickyFilteredEditorGroup1.onDidModelChange((e) => {
			if (e.kind === GroupModelChangeKind.EDITOR_LABEL) {
				label1ChangeCounterUnsticky++;
			}
		}));

		let label2ChangeCounterSticky = 0;
		disposables.add(stickyFilteredEditorGroup2.onDidModelChange((e) => {
			if (e.kind === GroupModelChangeKind.EDITOR_LABEL) {
				label2ChangeCounterSticky++;
			}
		}));

		let label2ChangeCounterUnsticky = 0;
		disposables.add(unstickyFilteredEditorGroup2.onDidModelChange((e) => {
			if (e.kind === GroupModelChangeKind.EDITOR_LABEL) {
				label2ChangeCounterUnsticky++;
			}
		}));

		(<TestEditorInput>input1).setDirty();
		(<TestEditorInput>input1).setLabel();

		assert.strictEqual(dirty1CounterSticky, 0);
		assert.strictEqual(dirty1CounterUnsticky, 1);
		assert.strictEqual(label1ChangeCounterSticky, 0);
		assert.strictEqual(label1ChangeCounterUnsticky, 1);

		(<TestEditorInput>input2).setDirty();
		(<TestEditorInput>input2).setLabel();

		assert.strictEqual(dirty2CounterSticky, 1);
		assert.strictEqual(dirty2CounterUnsticky, 0);
		assert.strictEqual(label2ChangeCounterSticky, 1);
		assert.strictEqual(label2ChangeCounterUnsticky, 0);

		closeAllEditors(model2);

		(<TestEditorInput>input2).setDirty();
		(<TestEditorInput>input2).setLabel();

		assert.strictEqual(dirty2CounterSticky, 1);
		assert.strictEqual(dirty2CounterUnsticky, 0);
		assert.strictEqual(label2ChangeCounterSticky, 1);
		assert.strictEqual(label2ChangeCounterUnsticky, 0);
		assert.strictEqual(dirty1CounterSticky, 0);
		assert.strictEqual(dirty1CounterUnsticky, 1);
		assert.strictEqual(label1ChangeCounterSticky, 0);
		assert.strictEqual(label1ChangeCounterUnsticky, 1);
	});

	test('Sticky/Unsticky isTransient()', async () => {
		const model = createEditorGroupModel();

		const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
		const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));

		const input1 = input();
		const input2 = input();
		const input3 = input();
		const input4 = input();

		model.openEditor(input1, { pinned: true, transient: false });
		model.openEditor(input2, { pinned: true });
		model.openEditor(input3, { pinned: true, transient: true });
		model.openEditor(input4, { pinned: false, transient: true });

		assert.strictEqual(stickyFilteredEditorGroup.isTransient(input1), false);
		assert.strictEqual(unstickyFilteredEditorGroup.isTransient(input2), false);
		assert.strictEqual(stickyFilteredEditorGroup.isTransient(input3), true);
		assert.strictEqual(unstickyFilteredEditorGroup.isTransient(input4), true);
	});

	// TypeFilteredEditorGroupModel tests

	class TypedEditorInput extends EditorInput {
		readonly resource = undefined;

		constructor(public id: string, private _typeId: string) {
			super();
		}
		override get typeId() { return this._typeId; }
		override async resolve(): Promise<IDisposable> { return null!; }

		override matches(other: TypedEditorInput): boolean {
			return other && this.id === other.id && other instanceof TypedEditorInput;
		}

		setDirty(): void {
			this._onDidChangeDirty.fire();
		}

		setLabel(): void {
			this._onDidChangeLabel.fire();
		}
	}

	function typedInput(id: string, typeId: string): TypedEditorInput {
		return disposables.add(new TypedEditorInput(id, typeId));
	}

	function createTerminalFilter(): EditorTypeGroupFilter {
		return (editor: EditorInput) => editor.typeId === 'workbench.editors.terminal';
	}

	function createTextEditorFilter(): EditorTypeGroupFilter {
		return (editor: EditorInput) => editor.typeId === 'testEditorInputForGroups';
	}

	test('TypeFiltered count', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const textEditor1 = input();
		const textEditor2 = input();
		const terminalEditor1 = typedInput('terminal1', 'workbench.editors.terminal');
		const terminalEditor2 = typedInput('terminal2', 'workbench.editors.terminal');

		model.openEditor(textEditor1, { pinned: true });
		model.openEditor(terminalEditor1, { pinned: true });
		model.openEditor(textEditor2, { pinned: true });
		model.openEditor(terminalEditor2, { pinned: true });

		assert.strictEqual(typeFilteredGroup.count, 2);

		model.closeEditor(terminalEditor1);

		assert.strictEqual(typeFilteredGroup.count, 1);

		model.closeEditor(terminalEditor2);

		assert.strictEqual(typeFilteredGroup.count, 0);
	});

	test('TypeFiltered stickyCount always returns 0', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const terminalEditor1 = typedInput('terminal1', 'workbench.editors.terminal');
		const terminalEditor2 = typedInput('terminal2', 'workbench.editors.terminal');

		model.openEditor(terminalEditor1, { pinned: true, sticky: true });
		model.openEditor(terminalEditor2, { pinned: true, sticky: true });

		// stickyCount should always be 0 because type filtered excludes sticky
		assert.strictEqual(typeFilteredGroup.stickyCount, 0);
		assert.strictEqual(model.stickyCount, 2);
	});

	test('TypeFiltered activeEditor returns null if not matching filter', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const textEditor = input();
		const terminalEditor = typedInput('terminal1', 'workbench.editors.terminal');

		model.openEditor(textEditor, { pinned: true, active: true });

		assert.strictEqual(typeFilteredGroup.activeEditor, null);

		model.openEditor(terminalEditor, { pinned: true, active: true });

		assert.strictEqual(typeFilteredGroup.activeEditor, terminalEditor);

		model.setActive(textEditor);

		assert.strictEqual(typeFilteredGroup.activeEditor, null);
	});

	test('TypeFiltered previewEditor returns null if not matching filter', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const textEditor = input();
		const terminalEditor = typedInput('terminal1', 'workbench.editors.terminal');

		model.openEditor(textEditor, { pinned: false }); // preview

		assert.strictEqual(typeFilteredGroup.previewEditor, null);

		model.openEditor(terminalEditor, { pinned: false }); // preview

		assert.strictEqual(typeFilteredGroup.previewEditor, terminalEditor);
	});

	test('TypeFiltered selectedEditors only returns editors matching filter', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const textEditor = input();
		const terminalEditor1 = typedInput('terminal1', 'workbench.editors.terminal');
		const terminalEditor2 = typedInput('terminal2', 'workbench.editors.terminal');

		model.openEditor(textEditor, { pinned: true });
		model.openEditor(terminalEditor1, { pinned: true });
		model.openEditor(terminalEditor2, { pinned: true });

		const selectedEditors = typeFilteredGroup.selectedEditors;
		// By default only active editor is selected
		assert.strictEqual(selectedEditors.length <= 2, true);
		// Verify text editor is not in selected
		assert.strictEqual(selectedEditors.includes(textEditor), false);
	});

	test('TypeFiltered getEditors() filters by type and excludes sticky', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const textEditor = input();
		const terminalEditor1 = typedInput('terminal1', 'workbench.editors.terminal');
		const terminalEditor2 = typedInput('terminal2', 'workbench.editors.terminal');
		const stickyTerminal = typedInput('terminal3', 'workbench.editors.terminal');

		model.openEditor(textEditor, { pinned: true });
		model.openEditor(terminalEditor1, { pinned: true });
		model.openEditor(terminalEditor2, { pinned: true });
		model.openEditor(stickyTerminal, { pinned: true, sticky: true });

		const editors = typeFilteredGroup.getEditors(EditorsOrder.SEQUENTIAL);

		// Should include non-sticky terminals only
		assert.strictEqual(editors.length, 2);
		assert.strictEqual(editors.includes(terminalEditor1), true);
		assert.strictEqual(editors.includes(terminalEditor2), true);
		assert.strictEqual(editors.includes(stickyTerminal), false); // sticky excluded
		assert.strictEqual(editors.includes(textEditor), false); // wrong type excluded
	});

	test('TypeFiltered getEditorByIndex() returns correct editor within filtered subset', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const textEditor = input();
		const terminalEditor1 = typedInput('terminal1', 'workbench.editors.terminal');
		const terminalEditor2 = typedInput('terminal2', 'workbench.editors.terminal');

		model.openEditor(textEditor, { pinned: true });
		model.openEditor(terminalEditor1, { pinned: true });
		model.openEditor(terminalEditor2, { pinned: true });

		assert.strictEqual(typeFilteredGroup.getEditorByIndex(0), terminalEditor1);
		assert.strictEqual(typeFilteredGroup.getEditorByIndex(1), terminalEditor2);
		assert.strictEqual(typeFilteredGroup.getEditorByIndex(2), undefined);
	});

	test('TypeFiltered indexOf() returns index within filtered subset, -1 if not matching', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const textEditor = input();
		const terminalEditor1 = typedInput('terminal1', 'workbench.editors.terminal');
		const terminalEditor2 = typedInput('terminal2', 'workbench.editors.terminal');

		model.openEditor(textEditor, { pinned: true });
		model.openEditor(terminalEditor1, { pinned: true });
		model.openEditor(terminalEditor2, { pinned: true });

		assert.strictEqual(typeFilteredGroup.indexOf(terminalEditor1), 0);
		assert.strictEqual(typeFilteredGroup.indexOf(terminalEditor2), 1);
		assert.strictEqual(typeFilteredGroup.indexOf(textEditor), -1); // not in filtered set
		assert.strictEqual(typeFilteredGroup.indexOf(null), -1);
	});

	test('TypeFiltered contains() true only if editor matches filter', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const textEditor = input();
		const terminalEditor = typedInput('terminal1', 'workbench.editors.terminal');
		const stickyTerminal = typedInput('terminal2', 'workbench.editors.terminal');

		model.openEditor(textEditor, { pinned: true });
		model.openEditor(terminalEditor, { pinned: true });
		model.openEditor(stickyTerminal, { pinned: true, sticky: true });

		assert.strictEqual(typeFilteredGroup.contains(terminalEditor), true);
		assert.strictEqual(typeFilteredGroup.contains(textEditor), false); // wrong type
		assert.strictEqual(typeFilteredGroup.contains(stickyTerminal), false); // sticky excluded
	});

	test('TypeFiltered isFirst/isLast correct within filtered subset', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const textEditor = input();
		const terminalEditor1 = typedInput('terminal1', 'workbench.editors.terminal');
		const terminalEditor2 = typedInput('terminal2', 'workbench.editors.terminal');

		model.openEditor(textEditor, { pinned: true });
		model.openEditor(terminalEditor1, { pinned: true });
		model.openEditor(terminalEditor2, { pinned: true });

		assert.strictEqual(typeFilteredGroup.isFirst(terminalEditor1), true);
		assert.strictEqual(typeFilteredGroup.isFirst(terminalEditor2), false);
		assert.strictEqual(typeFilteredGroup.isLast(terminalEditor1), false);
		assert.strictEqual(typeFilteredGroup.isLast(terminalEditor2), true);
	});

	test('TypeFiltered setTypeGroupFilter() changes filter and fires onDidFilterChange', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const textEditorFilter = createTextEditorFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const textEditor = input();
		const terminalEditor = typedInput('terminal1', 'workbench.editors.terminal');

		model.openEditor(textEditor, { pinned: true });
		model.openEditor(terminalEditor, { pinned: true });

		assert.strictEqual(typeFilteredGroup.count, 1);
		assert.strictEqual(typeFilteredGroup.contains(terminalEditor), true);
		assert.strictEqual(typeFilteredGroup.contains(textEditor), false);

		let filterChangeFired = false;
		disposables.add(typeFilteredGroup.onDidFilterChange(() => {
			filterChangeFired = true;
		}));

		typeFilteredGroup.setTypeGroupFilter(textEditorFilter);

		assert.strictEqual(filterChangeFired, true);
		assert.strictEqual(typeFilteredGroup.count, 1);
		assert.strictEqual(typeFilteredGroup.contains(terminalEditor), false);
		assert.strictEqual(typeFilteredGroup.contains(textEditor), true);
	});

	test('TypeFiltered onDidModelChange events are filtered appropriately', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const textEditor = input();
		const terminalEditor = typedInput('terminal1', 'workbench.editors.terminal');

		model.openEditor(textEditor, { pinned: true });
		model.openEditor(terminalEditor, { pinned: true });

		let dirtyCounterTerminal = 0;
		disposables.add(typeFilteredGroup.onDidModelChange((e) => {
			if (e.kind === GroupModelChangeKind.EDITOR_DIRTY) {
				dirtyCounterTerminal++;
			}
		}));

		// Dirty event for terminal should fire on filtered model
		(terminalEditor as TypedEditorInput).setDirty();
		assert.strictEqual(dirtyCounterTerminal, 1);

		// Dirty event for text editor should NOT fire on filtered model
		(<TestEditorInput>textEditor).setDirty();
		assert.strictEqual(dirtyCounterTerminal, 1); // still 1, not fired
	});

	test('TypeFiltered isSticky() always returns false', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const terminalEditor = typedInput('terminal1', 'workbench.editors.terminal');

		model.openEditor(terminalEditor, { pinned: true, sticky: true });

		// isSticky always returns false for type filtered model
		assert.strictEqual(typeFilteredGroup.isSticky(terminalEditor), false);
		assert.strictEqual(model.isSticky(terminalEditor), true);
	});

	test('TypeFiltered filter() correctly excludes sticky editors AND editors not matching type filter', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const textEditor = input();
		const terminalEditor = typedInput('terminal1', 'workbench.editors.terminal');
		const stickyTerminal = typedInput('terminal2', 'workbench.editors.terminal');
		const stickyText = input();

		model.openEditor(textEditor, { pinned: true });
		model.openEditor(terminalEditor, { pinned: true });
		model.openEditor(stickyTerminal, { pinned: true, sticky: true });
		model.openEditor(stickyText, { pinned: true, sticky: true });

		const editors = typeFilteredGroup.getEditors(EditorsOrder.SEQUENTIAL);

		// Only non-sticky terminal should be included
		assert.strictEqual(editors.length, 1);
		assert.strictEqual(editors[0], terminalEditor);
	});

	test('TypeFiltered findEditor()', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const textEditor = input();
		const terminalEditor = typedInput('terminal1', 'workbench.editors.terminal');

		model.openEditor(textEditor, { pinned: true });
		model.openEditor(terminalEditor, { pinned: true });

		const foundTerminal = typeFilteredGroup.findEditor(terminalEditor);
		assert.ok(foundTerminal);
		assert.strictEqual(foundTerminal[0], terminalEditor);
		assert.strictEqual(foundTerminal[1], 0);

		const foundText = typeFilteredGroup.findEditor(textEditor);
		assert.strictEqual(foundText, undefined);

		const foundNull = typeFilteredGroup.findEditor(null);
		assert.strictEqual(foundNull, undefined);
	});

	test('TypeFiltered group information', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		// same id
		assert.strictEqual(typeFilteredGroup.id, model.id);

		// group locking same behaviour
		assert.strictEqual(typeFilteredGroup.isLocked, model.isLocked);

		model.lock(true);
		assert.strictEqual(typeFilteredGroup.isLocked, model.isLocked);

		model.lock(false);
		assert.strictEqual(typeFilteredGroup.isLocked, model.isLocked);
	});

	test('TypeFiltered isPinned/isActive/isTransient delegate to underlying model', async () => {
		const model = createEditorGroupModel();

		const terminalFilter = createTerminalFilter();
		const typeFilteredGroup = disposables.add(new TypeFilteredEditorGroupModel(model, terminalFilter));

		const terminalEditor = typedInput('terminal1', 'workbench.editors.terminal');
		const terminalEditor2 = typedInput('terminal2', 'workbench.editors.terminal');

		model.openEditor(terminalEditor, { pinned: true, active: true, transient: false });
		model.openEditor(terminalEditor2, { pinned: false, active: false, transient: true });

		assert.strictEqual(typeFilteredGroup.isPinned(terminalEditor), true);
		assert.strictEqual(typeFilteredGroup.isPinned(terminalEditor2), false);
		assert.strictEqual(typeFilteredGroup.isActive(terminalEditor), true);
		assert.strictEqual(typeFilteredGroup.isActive(terminalEditor2), false);
		assert.strictEqual(typeFilteredGroup.isTransient(terminalEditor), false);
		assert.strictEqual(typeFilteredGroup.isTransient(terminalEditor2), true);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
