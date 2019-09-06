/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { BaseEditor, EditorMemento } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorInput, EditorOptions, IEditorInputFactory, IEditorInputFactoryRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as Platform from 'vs/platform/registry/common/platform';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { workbenchInstantiationService, TestEditorGroup, TestEditorGroupsService, TestStorageService } from 'vs/workbench/test/workbenchTestServices';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { URI } from 'vs/base/common/uri';
import { IEditorRegistry, Extensions, EditorDescriptor } from 'vs/workbench/browser/editor';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorModel } from 'vs/platform/editor/common/editor';

const NullThemeService = new TestThemeService();

let EditorRegistry: IEditorRegistry = Platform.Registry.as(Extensions.Editors);
let EditorInputRegistry: IEditorInputFactoryRegistry = Platform.Registry.as(EditorExtensions.EditorInputFactories);

export class MyEditor extends BaseEditor {

	constructor(@ITelemetryService telemetryService: ITelemetryService) {
		super('MyEditor', NullTelemetryService, NullThemeService, new TestStorageService());
	}

	getId(): string { return 'myEditor'; }
	layout(): void { }
	createEditor(): any { }
}

export class MyOtherEditor extends BaseEditor {

	constructor(@ITelemetryService telemetryService: ITelemetryService) {
		super('myOtherEditor', NullTelemetryService, NullThemeService, new TestStorageService());
	}

	getId(): string { return 'myOtherEditor'; }

	layout(): void { }
	createEditor(): any { }
}

class MyInputFactory implements IEditorInputFactory {

	serialize(input: EditorInput): string {
		return input.toString();
	}

	deserialize(instantiationService: IInstantiationService, raw: string): EditorInput {
		return {} as EditorInput;
	}
}

class MyInput extends EditorInput {
	getPreferredEditorId(ids: string[]) {
		return ids[1];
	}

	getTypeId(): string {
		return '';
	}

	resolve(): any {
		return null;
	}
}

class MyOtherInput extends EditorInput {
	getTypeId(): string {
		return '';
	}

	resolve(): any {
		return null;
	}
}
class MyResourceInput extends ResourceEditorInput { }

suite('Workbench base editor', () => {

	test('BaseEditor API', async () => {
		let e = new MyEditor(NullTelemetryService);
		let input = new MyOtherInput();
		let options = new EditorOptions();

		assert(!e.isVisible());
		assert(!e.input);
		assert(!e.options);

		await e.setInput(input, options, CancellationToken.None);
		assert.strictEqual(input, e.input);
		assert.strictEqual(options, e.options);
		const group = new TestEditorGroup(1);
		e.setVisible(true, group);
		assert(e.isVisible());
		assert.equal(e.group, group);
		input.onDispose(() => {
			assert(false);
		});
		e.dispose();
		e.clearInput();
		e.setVisible(false, group);
		assert(!e.isVisible());
		assert(!e.input);
		assert(!e.options);
		assert(!e.getControl());
	});

	test('EditorDescriptor', () => {
		let d = new EditorDescriptor(MyEditor, 'id', 'name');
		assert.strictEqual(d.getId(), 'id');
		assert.strictEqual(d.getName(), 'name');
	});

	test('Editor Registration', function () {
		let d1 = new EditorDescriptor(MyEditor, 'id1', 'name');
		let d2 = new EditorDescriptor(MyOtherEditor, 'id2', 'name');

		let oldEditorsCnt = EditorRegistry.getEditors().length;
		let oldInputCnt = (<any>EditorRegistry).getEditorInputs().length;

		EditorRegistry.registerEditor(d1, [new SyncDescriptor(MyInput)]);
		EditorRegistry.registerEditor(d2, [new SyncDescriptor(MyInput), new SyncDescriptor(MyOtherInput)]);

		assert.equal(EditorRegistry.getEditors().length, oldEditorsCnt + 2);
		assert.equal((<any>EditorRegistry).getEditorInputs().length, oldInputCnt + 3);

		assert.strictEqual(EditorRegistry.getEditor(new MyInput()), d2);
		assert.strictEqual(EditorRegistry.getEditor(new MyOtherInput()), d2);

		assert.strictEqual(EditorRegistry.getEditorById('id1'), d1);
		assert.strictEqual(EditorRegistry.getEditorById('id2'), d2);
		assert(!EditorRegistry.getEditorById('id3'));
	});

	test('Editor Lookup favors specific class over superclass (match on specific class)', function () {
		let d1 = new EditorDescriptor(MyEditor, 'id1', 'name');
		let d2 = new EditorDescriptor(MyOtherEditor, 'id2', 'name');

		let oldEditors = EditorRegistry.getEditors();
		(<any>EditorRegistry).setEditors([]);

		EditorRegistry.registerEditor(d2, [new SyncDescriptor(ResourceEditorInput)]);
		EditorRegistry.registerEditor(d1, [new SyncDescriptor(MyResourceInput)]);

		let inst = new TestInstantiationService();

		const editor = EditorRegistry.getEditor(inst.createInstance(MyResourceInput, 'fake', '', URI.file('/fake'), undefined))!.instantiate(inst);
		assert.strictEqual(editor.getId(), 'myEditor');

		const otherEditor = EditorRegistry.getEditor(inst.createInstance(ResourceEditorInput, 'fake', '', URI.file('/fake'), undefined))!.instantiate(inst);
		assert.strictEqual(otherEditor.getId(), 'myOtherEditor');

		(<any>EditorRegistry).setEditors(oldEditors);
	});

	test('Editor Lookup favors specific class over superclass (match on super class)', function () {
		let d1 = new EditorDescriptor(MyOtherEditor, 'id1', 'name');

		let oldEditors = EditorRegistry.getEditors();
		(<any>EditorRegistry).setEditors([]);

		EditorRegistry.registerEditor(d1, [new SyncDescriptor(ResourceEditorInput)]);

		let inst = new TestInstantiationService();

		const editor = EditorRegistry.getEditor(inst.createInstance(MyResourceInput, 'fake', '', URI.file('/fake'), undefined))!.instantiate(inst);
		assert.strictEqual('myOtherEditor', editor.getId());

		(<any>EditorRegistry).setEditors(oldEditors);
	});

	test('Editor Input Factory', function () {
		workbenchInstantiationService().invokeFunction(accessor => EditorInputRegistry.start(accessor));
		EditorInputRegistry.registerEditorInputFactory('myInputId', MyInputFactory);

		let factory = EditorInputRegistry.getEditorInputFactory('myInputId');
		assert(factory);
	});

	test('EditorMemento - basics', function () {
		const testGroup0 = new TestEditorGroup(0);
		const testGroup1 = new TestEditorGroup(1);
		const testGroup4 = new TestEditorGroup(4);

		const editorGroupService = new TestEditorGroupsService([
			testGroup0,
			testGroup1,
			new TestEditorGroup(2)
		]);

		interface TestViewState {
			line: number;
		}

		const rawMemento = Object.create(null);
		let memento = new EditorMemento<TestViewState>('id', 'key', rawMemento, 3, editorGroupService);

		let res = memento.loadEditorState(testGroup0, URI.file('/A'));
		assert.ok(!res);

		memento.saveEditorState(testGroup0, URI.file('/A'), { line: 3 });
		res = memento.loadEditorState(testGroup0, URI.file('/A'));
		assert.ok(res);
		assert.equal(res!.line, 3);

		memento.saveEditorState(testGroup1, URI.file('/A'), { line: 5 });
		res = memento.loadEditorState(testGroup1, URI.file('/A'));
		assert.ok(res);
		assert.equal(res!.line, 5);

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

		memento = new EditorMemento('id', 'key', rawMemento, 3, editorGroupService);
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

	test('EditoMemento - use with editor input', function () {
		const testGroup0 = new TestEditorGroup(0);

		interface TestViewState {
			line: number;
		}

		class TestEditorInput extends EditorInput {
			constructor(private resource: URI, private id = 'testEditorInput') {
				super();
			}
			public getTypeId() { return 'testEditorInput'; }
			public resolve(): Promise<IEditorModel> { return Promise.resolve(null!); }

			public matches(other: TestEditorInput): boolean {
				return other && this.id === other.id && other instanceof TestEditorInput;
			}

			public getResource(): URI {
				return this.resource;
			}
		}

		const rawMemento = Object.create(null);
		let memento = new EditorMemento<TestViewState>('id', 'key', rawMemento, 3, new TestEditorGroupsService());

		const testInputA = new TestEditorInput(URI.file('/A'));

		let res = memento.loadEditorState(testGroup0, testInputA);
		assert.ok(!res);

		memento.saveEditorState(testGroup0, testInputA, { line: 3 });
		res = memento.loadEditorState(testGroup0, testInputA);
		assert.ok(res);
		assert.equal(res!.line, 3);

		// State removed when input gets disposed
		testInputA.dispose();
		res = memento.loadEditorState(testGroup0, testInputA);
		assert.ok(!res);
	});

	return {
		MyEditor: MyEditor,
		MyOtherEditor: MyOtherEditor
	};
});