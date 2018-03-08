/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorInput, EditorOptions, IEditorInputFactory, IEditorInputFactoryRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as Platform from 'vs/platform/registry/common/platform';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import URI from 'vs/base/common/uri';
import { IEditorRegistry, Extensions, EditorDescriptor } from 'vs/workbench/browser/editor';

const NullThemeService = new TestThemeService();

let EditorRegistry: IEditorRegistry = Platform.Registry.as(Extensions.Editors);
let EditorInputRegistry: IEditorInputFactoryRegistry = Platform.Registry.as(EditorExtensions.EditorInputFactories);

export class MyEditor extends BaseEditor {

	constructor( @ITelemetryService telemetryService: ITelemetryService) {
		super('MyEditor', NullTelemetryService, NullThemeService);
	}

	getId(): string {
		return 'myEditor';
	}

	public layout(): void {

	}

	public createEditor(): any {

	}
}

export class MyOtherEditor extends BaseEditor {

	constructor( @ITelemetryService telemetryService: ITelemetryService) {
		super('myOtherEditor', NullTelemetryService, NullThemeService);
	}

	getId(): string {
		return 'myOtherEditor';
	}

	public layout(): void {

	}

	public createEditor(): any {

	}
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

	public getTypeId(): string {
		return '';
	}

	public resolve(refresh?: boolean): any {
		return null;
	}
}

class MyOtherInput extends EditorInput {
	public getTypeId(): string {
		return '';
	}

	public resolve(refresh?: boolean): any {
		return null;
	}
}
class MyResourceInput extends ResourceEditorInput { }

suite('Workbench BaseEditor', () => {

	test('BaseEditor API', function () {
		let e = new MyEditor(NullTelemetryService);
		let input = new MyOtherInput();
		let options = new EditorOptions();

		assert(!e.isVisible());
		assert(!e.input);
		assert(!e.options);
		return e.setInput(input, options).then(() => {
			assert.strictEqual(input, e.input);
			assert.strictEqual(options, e.options);

			e.setVisible(true);
			assert(e.isVisible());
			input.onDispose(() => {
				assert(false);
			});
			e.dispose();
			e.clearInput();
			e.setVisible(false);
			assert(!e.isVisible());
			assert(!e.input);
			assert(!e.options);
			assert(!e.getControl());
		});
	});

	test('EditorDescriptor', function () {
		let d = new EditorDescriptor(MyEditor, 'id', 'name');
		assert.strictEqual(d.getId(), 'id');
		assert.strictEqual(d.getName(), 'name');
	});

	test('Editor Registration', function () {
		let d1 = new EditorDescriptor(MyEditor, 'id1', 'name');
		let d2 = new EditorDescriptor(MyOtherEditor, 'id2', 'name');

		let oldEditorsCnt = EditorRegistry.getEditors().length;
		let oldInputCnt = (<any>EditorRegistry).getEditorInputs().length;

		EditorRegistry.registerEditor(d1, new SyncDescriptor(MyInput));
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

		EditorRegistry.registerEditor(d2, new SyncDescriptor(ResourceEditorInput));
		EditorRegistry.registerEditor(d1, new SyncDescriptor(MyResourceInput));

		let inst = new TestInstantiationService();

		const editor = EditorRegistry.getEditor(inst.createInstance(MyResourceInput, 'fake', '', URI.file('/fake'))).instantiate(inst);
		assert.strictEqual(editor.getId(), 'myEditor');

		const otherEditor = EditorRegistry.getEditor(inst.createInstance(ResourceEditorInput, 'fake', '', URI.file('/fake'))).instantiate(inst);
		assert.strictEqual(otherEditor.getId(), 'myOtherEditor');

		(<any>EditorRegistry).setEditors(oldEditors);
	});

	test('Editor Lookup favors specific class over superclass (match on super class)', function () {
		let d1 = new EditorDescriptor(MyOtherEditor, 'id1', 'name');

		let oldEditors = EditorRegistry.getEditors();
		(<any>EditorRegistry).setEditors([]);

		EditorRegistry.registerEditor(d1, new SyncDescriptor(ResourceEditorInput));

		let inst = new TestInstantiationService();

		const editor = EditorRegistry.getEditor(inst.createInstance(MyResourceInput, 'fake', '', URI.file('/fake'))).instantiate(inst);
		assert.strictEqual('myOtherEditor', editor.getId());

		(<any>EditorRegistry).setEditors(oldEditors);
	});

	test('Editor Input Factory', function () {
		EditorInputRegistry.setInstantiationService(workbenchInstantiationService());
		EditorInputRegistry.registerEditorInputFactory('myInputId', MyInputFactory);

		let factory = EditorInputRegistry.getEditorInputFactory('myInputId');
		assert(factory);
	});

	return {
		MyEditor: MyEditor,
		MyOtherEditor: MyOtherEditor
	};
});