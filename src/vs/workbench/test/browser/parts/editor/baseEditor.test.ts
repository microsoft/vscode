/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { BaseEditor, EditorInputAction, EditorInputActionContributor, EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorInput, EditorOptions, Extensions, IEditorRegistry, IEditorInputFactory } from 'vs/workbench/common/editor';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as Platform from 'vs/platform/platform';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { StringEditorInput } from 'vs/workbench/common/editor/stringEditorInput';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { workbenchInstantiationService, TestThemeService } from 'vs/workbench/test/workbenchTestServices';

const NullThemeService = new TestThemeService();

let EditorRegistry: IEditorRegistry = Platform.Registry.as(Extensions.Editors);

export class MyEditor extends BaseEditor {

	constructor(id: string, @ITelemetryService telemetryService: ITelemetryService) {
		super(id, NullTelemetryService, NullThemeService);
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

	constructor(id: string, @ITelemetryService telemetryService: ITelemetryService) {
		super(id, NullTelemetryService, NullThemeService);
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
		return <EditorInput>{};
	}
}

class MyInput extends EditorInput {
	getPreferredEditorId(ids) {
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
class MyStringInput extends StringEditorInput { }

class MyAction extends EditorInputAction {

	public didCallIsEnabled = false;

	isEnabled() {
		this.didCallIsEnabled = true;
		return true;
	}
}

class MyAction2 extends EditorInputAction {
	isEnabled() {
		return true;
	}
}

class MyEditorInputActionContributor extends EditorInputActionContributor {
	hasActionsForEditorInput(context) {
		return context.input instanceof StringEditorInput;
	}

	getActionsForEditorInput(context) {
		return [
			new MyAction2('id1', 'label1'),
			new MyAction2('id2', 'label2')
		];
	}
}

suite('Workbench BaseEditor', () => {

	test('BaseEditor API', function (done) {
		let e = new MyEditor('id', NullTelemetryService);
		let input = new MyOtherInput();
		let options = new EditorOptions();

		assert(!e.isVisible());
		assert(!e.input);
		assert(!e.options);
		e.setInput(input, options).then(() => {
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
		}).done(() => done());
	});

	test('EditorDescriptor', function () {
		let d = new EditorDescriptor('id', 'name', 'vs/workbench/test/browser/parts/editor/baseEditor.test', 'MyClass');
		assert.strictEqual(d.getId(), 'id');
		assert.strictEqual(d.getName(), 'name');
	});

	test('Editor Registration', function () {
		let d1 = new EditorDescriptor('id1', 'name', 'vs/workbench/test/browser/parts/editor/baseEditor.test', 'MyClass');
		let d2 = new EditorDescriptor('id2', 'name', 'vs/workbench/test/browser/parts/editor/baseEditor.test', 'MyOtherClass');

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

	test('Editor Lookup favors specific class over superclass (match on specific class)', function (done) {
		let d1 = new EditorDescriptor('id1', 'name', 'vs/workbench/test/browser/parts/editor/baseEditor.test', 'MyEditor');
		let d2 = new EditorDescriptor('id2', 'name', 'vs/workbench/test/browser/parts/editor/baseEditor.test', 'MyOtherEditor');

		let oldEditors = EditorRegistry.getEditors();
		(<any>EditorRegistry).setEditors([]);

		EditorRegistry.registerEditor(d2, new SyncDescriptor(StringEditorInput));
		EditorRegistry.registerEditor(d1, new SyncDescriptor(MyStringInput));

		let inst = new TestInstantiationService();

		inst.createInstance(EditorRegistry.getEditor(inst.createInstance(MyStringInput, 'fake', '', '', PLAINTEXT_MODE_ID, false)), 'id').then(editor => {
			assert.strictEqual(editor.getId(), 'myEditor');

			return inst.createInstance(EditorRegistry.getEditor(inst.createInstance(StringEditorInput, 'fake', '', '', PLAINTEXT_MODE_ID, false)), 'id').then(editor => {
				assert.strictEqual(editor.getId(), 'myOtherEditor');

				(<any>EditorRegistry).setEditors(oldEditors);
			});
		}).done(() => done());
	});

	test('Editor Lookup favors specific class over superclass (match on super class)', function (done) {
		let d1 = new EditorDescriptor('id1', 'name', 'vs/workbench/test/browser/parts/editor/baseEditor.test', 'MyOtherEditor');

		let oldEditors = EditorRegistry.getEditors();
		(<any>EditorRegistry).setEditors([]);

		EditorRegistry.registerEditor(d1, new SyncDescriptor(StringEditorInput));

		let inst = new TestInstantiationService();

		inst.createInstance(EditorRegistry.getEditor(inst.createInstance(MyStringInput, 'fake', '', '', PLAINTEXT_MODE_ID, false)), 'id').then(editor => {
			assert.strictEqual('myOtherEditor', editor.getId());

			(<any>EditorRegistry).setEditors(oldEditors);
		}).done(() => done());
	});

	test('Editor Input Action - triggers isEnabled properly', function () {
		let inst = new TestInstantiationService();

		let action = new MyAction('id', 'label');
		action.input = inst.createInstance(StringEditorInput, 'input', '', '', PLAINTEXT_MODE_ID, false);
		assert.equal(action.didCallIsEnabled, true);
	});

	test('Editor Input Action Contributor', function () {
		let inst = new TestInstantiationService();

		let contributor = new MyEditorInputActionContributor();

		assert(!contributor.hasActions(null));
		assert(contributor.hasActions({ editor: new MyEditor('id', NullTelemetryService), input: inst.createInstance(StringEditorInput, 'fake', '', '', PLAINTEXT_MODE_ID, false), position: 0 }));

		let actionsFirst = contributor.getActions({ editor: new MyEditor('id', NullTelemetryService), input: inst.createInstance(StringEditorInput, 'fake', '', '', PLAINTEXT_MODE_ID, false), position: 0 });
		assert.strictEqual(actionsFirst.length, 2);

		let input = inst.createInstance(StringEditorInput, 'fake', '', '', PLAINTEXT_MODE_ID, false);
		let actions = contributor.getActions({ editor: new MyEditor('id', NullTelemetryService), input: input, position: 0 });
		assert(actions[0] === actionsFirst[0]);
		assert(actions[1] === actionsFirst[1]);
		assert((<any>actions[0]).input === input);
		assert((<any>actions[1]).input === input);

		// other editor causes new actions to be created
		actions = contributor.getActions({ editor: new MyOtherEditor('id2', NullTelemetryService), input: input, position: 0 });
		assert(actions[0] !== actionsFirst[0]);
		assert(actions[1] !== actionsFirst[1]);
		assert((<any>actions[0]).input === input);
		assert((<any>actions[1]).input === input);

		// other input causes actions to loose input context
		let myInput = new MyInput();
		myInput.getTypeId = function () {
			return 'foo.id';
		};

		actions = contributor.getActions({ editor: new MyEditor('id3', NullTelemetryService), input: myInput, position: 0 });
		assert(!(<any>actionsFirst[0]).input);
		assert(!(<any>actionsFirst[1]).input);
	});

	test('Editor Input Factory', function () {
		EditorRegistry.setInstantiationService(workbenchInstantiationService());
		EditorRegistry.registerEditorInputFactory('myInputId', MyInputFactory);

		let factory = EditorRegistry.getEditorInputFactory('myInputId');
		assert(factory);
	});

	return {
		MyEditor: MyEditor,
		MyOtherEditor: MyOtherEditor
	};
});