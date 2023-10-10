/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EditorPane, EditorMemento } from 'vs/workbench/browser/parts/editor/editorPane';
import { WorkspaceTrustRequiredPlaceholderEditor } from 'vs/workbench/browser/parts/editor/editorPlaceholder';
import { IEditorSerializer, IEditorFactoryRegistry, EditorExtensions, EditorInputCapabilities, IEditorDescriptor, IEditorPane } from 'vs/workbench/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { workbenchInstantiationService, TestEditorGroupView, TestEditorGroupsService, registerTestResourceEditor, TestEditorInput, createEditorPart, TestTextResourceConfigurationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { TextResourceEditorInput } from 'vs/workbench/common/editor/textResourceEditorInput';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { URI } from 'vs/base/common/uri';
import { EditorPaneDescriptor, EditorPaneRegistry } from 'vs/workbench/browser/editor';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { TestStorageService, TestWorkspaceTrustManagementService } from 'vs/workbench/test/common/workbenchTestServices';
import { extUri } from 'vs/base/common/resources';
import { EditorService } from 'vs/workbench/services/editor/browser/editorService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

const NullThemeService = new TestThemeService();

const editorRegistry: EditorPaneRegistry = Registry.as(EditorExtensions.EditorPane);
const editorInputRegistry: IEditorFactoryRegistry = Registry.as(EditorExtensions.EditorFactory);

class TestEditor extends EditorPane {

	constructor() {
		const disposables = new DisposableStore();
		super('TestEditor', NullTelemetryService, NullThemeService, disposables.add(new TestStorageService()));

		this._register(disposables);
	}

	override getId(): string { return 'testEditor'; }
	layout(): void { }
	protected createEditor(): any { }
}

class OtherTestEditor extends EditorPane {

	constructor() {
		const disposables = new DisposableStore();
		super('testOtherEditor', NullTelemetryService, NullThemeService, disposables.add(new TestStorageService()));

		this._register(disposables);
	}

	override getId(): string { return 'testOtherEditor'; }

	layout(): void { }
	protected createEditor(): any { }
}

class TestInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(input: EditorInput): string {
		return input.toString();
	}

	deserialize(instantiationService: IInstantiationService, raw: string): EditorInput {
		return {} as EditorInput;
	}
}

class TestInput extends EditorInput {

	readonly resource = undefined;

	override prefersEditorPane<T extends IEditorDescriptor<IEditorPane>>(editors: T[]): T | undefined {
		return editors[1];
	}

	override get typeId(): string {
		return 'testInput';
	}

	override resolve(): any {
		return null;
	}
}

class OtherTestInput extends EditorInput {

	readonly resource = undefined;

	override get typeId(): string {
		return 'otherTestInput';
	}

	override resolve(): any {
		return null;
	}
}
class TestResourceEditorInput extends TextResourceEditorInput { }

suite('EditorPane', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	test('EditorPane API', async () => {
		const editor = new TestEditor();
		const input = disposables.add(new OtherTestInput());
		const options = {};

		assert(!editor.isVisible());
		assert(!editor.input);

		await editor.setInput(input, options, Object.create(null), CancellationToken.None);
		assert.strictEqual(<any>input, editor.input);
		const group = new TestEditorGroupView(1);
		editor.setVisible(true, group);
		assert(editor.isVisible());
		assert.strictEqual(editor.group, group);
		editor.dispose();
		editor.clearInput();
		editor.setVisible(false, group);
		assert(!editor.isVisible());
		assert(!editor.input);
		assert(!editor.getControl());
	});

	test('EditorPaneDescriptor', () => {
		const editorDescriptor = EditorPaneDescriptor.create(TestEditor, 'id', 'name');
		assert.strictEqual(editorDescriptor.typeId, 'id');
		assert.strictEqual(editorDescriptor.name, 'name');
	});

	test('Editor Pane Registration', function () {
		const editorDescriptor1 = EditorPaneDescriptor.create(TestEditor, 'id1', 'name');
		const editorDescriptor2 = EditorPaneDescriptor.create(OtherTestEditor, 'id2', 'name');

		const oldEditorsCnt = editorRegistry.getEditorPanes().length;
		const oldInputCnt = editorRegistry.getEditors().length;

		disposables.add(editorRegistry.registerEditorPane(editorDescriptor1, [new SyncDescriptor(TestInput)]));
		disposables.add(editorRegistry.registerEditorPane(editorDescriptor2, [new SyncDescriptor(TestInput), new SyncDescriptor(OtherTestInput)]));

		assert.strictEqual(editorRegistry.getEditorPanes().length, oldEditorsCnt + 2);
		assert.strictEqual(editorRegistry.getEditors().length, oldInputCnt + 3);

		assert.strictEqual(editorRegistry.getEditorPane(disposables.add(new TestInput())), editorDescriptor2);
		assert.strictEqual(editorRegistry.getEditorPane(disposables.add(new OtherTestInput())), editorDescriptor2);

		assert.strictEqual(editorRegistry.getEditorPaneByType('id1'), editorDescriptor1);
		assert.strictEqual(editorRegistry.getEditorPaneByType('id2'), editorDescriptor2);
		assert(!editorRegistry.getEditorPaneByType('id3'));
	});

	test('Editor Pane Lookup favors specific class over superclass (match on specific class)', function () {
		const d1 = EditorPaneDescriptor.create(TestEditor, 'id1', 'name');

		disposables.add(registerTestResourceEditor());
		disposables.add(editorRegistry.registerEditorPane(d1, [new SyncDescriptor(TestResourceEditorInput)]));

		const inst = workbenchInstantiationService(undefined, disposables);

		const editor = disposables.add(editorRegistry.getEditorPane(disposables.add(inst.createInstance(TestResourceEditorInput, URI.file('/fake'), 'fake', '', undefined, undefined)))!.instantiate(inst));
		assert.strictEqual(editor.getId(), 'testEditor');

		const otherEditor = disposables.add(editorRegistry.getEditorPane(disposables.add(inst.createInstance(TextResourceEditorInput, URI.file('/fake'), 'fake', '', undefined, undefined)))!.instantiate(inst));
		assert.strictEqual(otherEditor.getId(), 'workbench.editors.textResourceEditor');
	});

	test('Editor Pane Lookup favors specific class over superclass (match on super class)', function () {
		const inst = workbenchInstantiationService(undefined, disposables);

		disposables.add(registerTestResourceEditor());
		const editor = disposables.add(editorRegistry.getEditorPane(disposables.add(inst.createInstance(TestResourceEditorInput, URI.file('/fake'), 'fake', '', undefined, undefined)))!.instantiate(inst));

		assert.strictEqual('workbench.editors.textResourceEditor', editor.getId());
	});

	test('Editor Input Serializer', function () {
		const testInput = disposables.add(new TestEditorInput(URI.file('/fake'), 'testTypeId'));
		workbenchInstantiationService(undefined, disposables).invokeFunction(accessor => editorInputRegistry.start(accessor));
		disposables.add(editorInputRegistry.registerEditorSerializer(testInput.typeId, TestInputSerializer));

		let factory = editorInputRegistry.getEditorSerializer('testTypeId');
		assert(factory);

		factory = editorInputRegistry.getEditorSerializer(testInput);
		assert(factory);

		// throws when registering serializer for same type
		assert.throws(() => editorInputRegistry.registerEditorSerializer(testInput.typeId, TestInputSerializer));
	});

	test('EditorMemento - basics', function () {
		const testGroup0 = new TestEditorGroupView(0);
		const testGroup1 = new TestEditorGroupView(1);
		const testGroup4 = new TestEditorGroupView(4);

		const configurationService = new TestTextResourceConfigurationService();

		const editorGroupService = new TestEditorGroupsService([
			testGroup0,
			testGroup1,
			new TestEditorGroupView(2)
		]);

		interface TestViewState {
			line: number;
		}

		const rawMemento = Object.create(null);
		let memento = disposables.add(new EditorMemento<TestViewState>('id', 'key', rawMemento, 3, editorGroupService, configurationService));

		let res = memento.loadEditorState(testGroup0, URI.file('/A'));
		assert.ok(!res);

		memento.saveEditorState(testGroup0, URI.file('/A'), { line: 3 });
		res = memento.loadEditorState(testGroup0, URI.file('/A'));
		assert.ok(res);
		assert.strictEqual(res!.line, 3);

		memento.saveEditorState(testGroup1, URI.file('/A'), { line: 5 });
		res = memento.loadEditorState(testGroup1, URI.file('/A'));
		assert.ok(res);
		assert.strictEqual(res!.line, 5);

		// Ensure capped at 3 elements
		memento.saveEditorState(testGroup0, URI.file('/B'), { line: 1 });
		memento.saveEditorState(testGroup0, URI.file('/C'), { line: 1 });
		memento.saveEditorState(testGroup0, URI.file('/D'), { line: 1 });
		memento.saveEditorState(testGroup0, URI.file('/E'), { line: 1 });

		assert.ok(!memento.loadEditorState(testGroup0, URI.file('/A')));
		assert.ok(!memento.loadEditorState(testGroup0, URI.file('/B')));
		assert.ok(memento.loadEditorState(testGroup0, URI.file('/C')));
		assert.ok(memento.loadEditorState(testGroup0, URI.file('/D')));
		assert.ok(memento.loadEditorState(testGroup0, URI.file('/E')));

		// Save at an unknown group
		memento.saveEditorState(testGroup4, URI.file('/E'), { line: 1 });
		assert.ok(memento.loadEditorState(testGroup4, URI.file('/E'))); // only gets removed when memento is saved
		memento.saveEditorState(testGroup4, URI.file('/C'), { line: 1 });
		assert.ok(memento.loadEditorState(testGroup4, URI.file('/C'))); // only gets removed when memento is saved

		memento.saveState();

		memento = disposables.add(new EditorMemento('id', 'key', rawMemento, 3, editorGroupService, configurationService));
		assert.ok(memento.loadEditorState(testGroup0, URI.file('/C')));
		assert.ok(memento.loadEditorState(testGroup0, URI.file('/D')));
		assert.ok(memento.loadEditorState(testGroup0, URI.file('/E')));

		// Check on entries no longer there from invalid groups
		assert.ok(!memento.loadEditorState(testGroup4, URI.file('/E')));
		assert.ok(!memento.loadEditorState(testGroup4, URI.file('/C')));

		memento.clearEditorState(URI.file('/C'), testGroup4);
		memento.clearEditorState(URI.file('/E'));

		assert.ok(!memento.loadEditorState(testGroup4, URI.file('/C')));
		assert.ok(memento.loadEditorState(testGroup0, URI.file('/D')));
		assert.ok(!memento.loadEditorState(testGroup0, URI.file('/E')));
	});

	test('EditorMemento - move', function () {
		const testGroup0 = new TestEditorGroupView(0);

		const configurationService = new TestTextResourceConfigurationService();
		const editorGroupService = new TestEditorGroupsService([testGroup0]);

		interface TestViewState { line: number }

		const rawMemento = Object.create(null);
		const memento = disposables.add(new EditorMemento<TestViewState>('id', 'key', rawMemento, 3, editorGroupService, configurationService));

		memento.saveEditorState(testGroup0, URI.file('/some/folder/file-1.txt'), { line: 1 });
		memento.saveEditorState(testGroup0, URI.file('/some/folder/file-2.txt'), { line: 2 });
		memento.saveEditorState(testGroup0, URI.file('/some/other/file.txt'), { line: 3 });

		memento.moveEditorState(URI.file('/some/folder/file-1.txt'), URI.file('/some/folder/file-moved.txt'), extUri);

		let res = memento.loadEditorState(testGroup0, URI.file('/some/folder/file-1.txt'));
		assert.ok(!res);

		res = memento.loadEditorState(testGroup0, URI.file('/some/folder/file-moved.txt'));
		assert.strictEqual(res?.line, 1);

		memento.moveEditorState(URI.file('/some/folder'), URI.file('/some/folder-moved'), extUri);

		res = memento.loadEditorState(testGroup0, URI.file('/some/folder-moved/file-moved.txt'));
		assert.strictEqual(res?.line, 1);

		res = memento.loadEditorState(testGroup0, URI.file('/some/folder-moved/file-2.txt'));
		assert.strictEqual(res?.line, 2);
	});

	test('EditoMemento - use with editor input', function () {
		const testGroup0 = new TestEditorGroupView(0);

		interface TestViewState {
			line: number;
		}

		class TestEditorInput extends EditorInput {
			constructor(public resource: URI, private id = 'testEditorInputForMementoTest') {
				super();
			}
			override get typeId() { return 'testEditorInputForMementoTest'; }
			override async resolve(): Promise<IEditorModel | null> { return null; }

			override matches(other: TestEditorInput): boolean {
				return other && this.id === other.id && other instanceof TestEditorInput;
			}
		}

		const rawMemento = Object.create(null);
		const memento = disposables.add(new EditorMemento<TestViewState>('id', 'key', rawMemento, 3, new TestEditorGroupsService(), new TestTextResourceConfigurationService()));

		const testInputA = disposables.add(new TestEditorInput(URI.file('/A')));

		let res = memento.loadEditorState(testGroup0, testInputA);
		assert.ok(!res);

		memento.saveEditorState(testGroup0, testInputA, { line: 3 });
		res = memento.loadEditorState(testGroup0, testInputA);
		assert.ok(res);
		assert.strictEqual(res!.line, 3);

		// State removed when input gets disposed
		testInputA.dispose();
		res = memento.loadEditorState(testGroup0, testInputA);
		assert.ok(!res);
	});

	test('EditoMemento - clear on editor dispose', function () {
		const testGroup0 = new TestEditorGroupView(0);

		interface TestViewState {
			line: number;
		}

		class TestEditorInput extends EditorInput {
			constructor(public resource: URI, private id = 'testEditorInputForMementoTest') {
				super();
			}
			override get typeId() { return 'testEditorInputForMementoTest'; }
			override async resolve(): Promise<IEditorModel | null> { return null; }

			override matches(other: TestEditorInput): boolean {
				return other && this.id === other.id && other instanceof TestEditorInput;
			}
		}

		const rawMemento = Object.create(null);
		const memento = disposables.add(new EditorMemento<TestViewState>('id', 'key', rawMemento, 3, new TestEditorGroupsService(), new TestTextResourceConfigurationService()));

		const testInputA = disposables.add(new TestEditorInput(URI.file('/A')));

		let res = memento.loadEditorState(testGroup0, testInputA);
		assert.ok(!res);

		memento.saveEditorState(testGroup0, testInputA.resource, { line: 3 });
		res = memento.loadEditorState(testGroup0, testInputA);
		assert.ok(res);
		assert.strictEqual(res!.line, 3);

		// State not yet removed when input gets disposed
		// because we used resource
		testInputA.dispose();
		res = memento.loadEditorState(testGroup0, testInputA);
		assert.ok(res);

		const testInputB = disposables.add(new TestEditorInput(URI.file('/B')));

		res = memento.loadEditorState(testGroup0, testInputB);
		assert.ok(!res);

		memento.saveEditorState(testGroup0, testInputB.resource, { line: 3 });
		res = memento.loadEditorState(testGroup0, testInputB);
		assert.ok(res);
		assert.strictEqual(res!.line, 3);

		memento.clearEditorStateOnDispose(testInputB.resource, testInputB);

		// State removed when input gets disposed
		testInputB.dispose();
		res = memento.loadEditorState(testGroup0, testInputB);
		assert.ok(!res);
	});

	test('EditorMemento - workbench.editor.sharedViewState', function () {
		const testGroup0 = new TestEditorGroupView(0);
		const testGroup1 = new TestEditorGroupView(1);

		const configurationService = new TestTextResourceConfigurationService(new TestConfigurationService({
			workbench: {
				editor: {
					sharedViewState: true
				}
			}
		}));
		const editorGroupService = new TestEditorGroupsService([testGroup0]);

		interface TestViewState { line: number }

		const rawMemento = Object.create(null);
		const memento = disposables.add(new EditorMemento<TestViewState>('id', 'key', rawMemento, 3, editorGroupService, configurationService));

		const resource = URI.file('/some/folder/file-1.txt');
		memento.saveEditorState(testGroup0, resource, { line: 1 });

		let res = memento.loadEditorState(testGroup0, resource);
		assert.strictEqual(res!.line, 1);

		res = memento.loadEditorState(testGroup1, resource);
		assert.strictEqual(res!.line, 1);

		memento.saveEditorState(testGroup0, resource, { line: 3 });

		res = memento.loadEditorState(testGroup1, resource);
		assert.strictEqual(res!.line, 3);

		memento.saveEditorState(testGroup1, resource, { line: 1 });

		res = memento.loadEditorState(testGroup1, resource);
		assert.strictEqual(res!.line, 1);

		memento.clearEditorState(resource, testGroup0);
		memento.clearEditorState(resource, testGroup1);

		res = memento.loadEditorState(testGroup1, resource);
		assert.strictEqual(res!.line, 1);

		memento.clearEditorState(resource);

		res = memento.loadEditorState(testGroup1, resource);
		assert.ok(!res);
	});

	test('WorkspaceTrustRequiredEditor', async function () {

		class TrustRequiredTestEditor extends EditorPane {
			constructor(@ITelemetryService telemetryService: ITelemetryService) {
				super('TestEditor', NullTelemetryService, NullThemeService, disposables.add(new TestStorageService()));
			}

			override getId(): string { return 'trustRequiredTestEditor'; }
			layout(): void { }
			protected createEditor(): any { }
		}

		class TrustRequiredTestInput extends EditorInput {

			readonly resource = undefined;

			override get typeId(): string {
				return 'trustRequiredTestInput';
			}

			override get capabilities(): EditorInputCapabilities {
				return EditorInputCapabilities.RequiresTrust;
			}

			override resolve(): any {
				return null;
			}
		}

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const workspaceTrustService = disposables.add(instantiationService.createInstance(TestWorkspaceTrustManagementService));
		instantiationService.stub(IWorkspaceTrustManagementService, workspaceTrustService);
		workspaceTrustService.setWorkspaceTrust(false);

		const editorPart = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, editorPart);

		const editorService = disposables.add(instantiationService.createInstance(EditorService));
		instantiationService.stub(IEditorService, editorService);

		const group = editorPart.activeGroup;

		const editorDescriptor = EditorPaneDescriptor.create(TrustRequiredTestEditor, 'id1', 'name');
		disposables.add(editorRegistry.registerEditorPane(editorDescriptor, [new SyncDescriptor(TrustRequiredTestInput)]));

		const testInput = disposables.add(new TrustRequiredTestInput());

		await group.openEditor(testInput);
		assert.strictEqual(group.activeEditorPane?.getId(), WorkspaceTrustRequiredPlaceholderEditor.ID);

		const getEditorPaneIdAsync = () => new Promise(resolve => {
			disposables.add(editorService.onDidActiveEditorChange(() => {
				resolve(group.activeEditorPane?.getId());
			}));
		});

		workspaceTrustService.setWorkspaceTrust(true);

		assert.strictEqual(await getEditorPaneIdAsync(), 'trustRequiredTestEditor');

		workspaceTrustService.setWorkspaceTrust(false);
		assert.strictEqual(await getEditorPaneIdAsync(), WorkspaceTrustRequiredPlaceholderEditor.ID);

		await group.closeAllEditors();
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
