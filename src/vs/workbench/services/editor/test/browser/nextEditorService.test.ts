/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { TPromise } from 'vs/base/common/winjs.base';
import * as paths from 'vs/base/common/paths';
import { IEditorInput, IEditorModel } from 'vs/platform/editor/common/editor';
import URI from 'vs/base/common/uri';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorInput, EditorOptions, IFileEditorInput } from 'vs/workbench/common/editor';
import { workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { NextEditorService, DelegatingWorkbenchEditorService } from 'vs/workbench/services/editor/browser/nextEditorService';
import { INextEditorGroup, INextEditorGroupsService } from 'vs/workbench/services/group/common/nextEditorGroupsService';
import { NextEditorPart } from 'vs/workbench/browser/parts/editor2/nextEditorPart';
import { Dimension } from 'vs/base/browser/dom';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { INextEditorService } from 'vs/workbench/services/editor/common/nextEditorService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IEditorRegistry, EditorDescriptor, Extensions } from 'vs/workbench/browser/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';

export class TestEditorControl extends BaseEditor {

	constructor(@ITelemetryService telemetryService: ITelemetryService) { super('MyTestFileEditorForNextEditorService', NullTelemetryService, new TestThemeService()); }

	getId(): string { return 'myTestFileEditorForNextEditorService'; }
	layout(): void { }
	createEditor(): any { }
}

export class TestEditorInput extends EditorInput implements IFileEditorInput {

	constructor(private resource: URI) { super(); }

	getTypeId() { return 'testFileEditorInputForNextEditorService'; }
	resolve(): TPromise<IEditorModel> { return null; }
	matches(other: TestEditorInput): boolean { return other && this.resource.toString() === other.resource.toString() && other instanceof TestEditorInput; }
	setEncoding(encoding: string) { }
	getEncoding(): string { return null; }
	setPreferredEncoding(encoding: string) { }
	getResource(): URI { return this.resource; }
	setForceOpenAsBinary(): void { }
}

suite('NextEditorService editor2', () => {

	test('basics', function () {
		const partInstantiator = workbenchInstantiationService();

		const part = partInstantiator.createInstance(NextEditorPart, 'id', false);
		part.create(document.createElement('div'));
		part.layout(new Dimension(400, 300));

		const testInstantiationService = partInstantiator.createChild(new ServiceCollection([INextEditorGroupsService, part]));

		const service: INextEditorService = testInstantiationService.createInstance(NextEditorService);

		const input = testInstantiationService.createInstance(TestEditorInput, URI.parse('my://resource'));

		let willOpenEditorEventCounter = 0;
		const willOpenEditorListener = service.onWillOpenEditor(() => {
			willOpenEditorEventCounter++;
		});

		let activeEditorChangeEventCounter = 0;
		const activeEditorChangeListener = service.onDidActiveEditorChange(() => {
			activeEditorChangeEventCounter++;
		});

		let visibleEditorChangeEventCounter = 0;
		const visibleEditorChangeListener = service.onDidVisibleEditorsChange(() => {
			visibleEditorChangeEventCounter++;
		});

		let didCloseEditorListenerCounter = 0;
		const didCloseEditorListener = service.onDidCloseEditor(editor => {
			didCloseEditorListenerCounter++;
		});

		let willCloseEditorListenerCounter = 0;
		const willCloseEditorListener = service.onWillCloseEditor(editor => {
			willCloseEditorListenerCounter++;
		});

		// Open EditorInput
		return service.openEditor(input).then(editor => {
			assert.ok(editor instanceof TestEditorControl);
			assert.equal(editor, service.activeControl);
			assert.equal(input, service.activeEditor);
			assert.equal(service.visibleControls.length, 1);
			assert.equal(service.visibleControls[0], editor);
			assert.ok(!service.activeTextEditorControl);
			assert.equal(service.visibleTextEditorControls.length, 0);
			assert.equal(service.isOpen(input), true);
			assert.equal(activeEditorChangeEventCounter, 1);
			assert.equal(visibleEditorChangeEventCounter, 1);
			assert.equal(willOpenEditorEventCounter, 1);

			service.closeEditor(input, editor.group);
			assert.equal(willCloseEditorListenerCounter, 1);
			assert.equal(didCloseEditorListenerCounter, 1);

			activeEditorChangeListener.dispose();
			visibleEditorChangeListener.dispose();
			willCloseEditorListener.dispose();
			didCloseEditorListener.dispose();
			willOpenEditorListener.dispose();
		});
	});

	test('caching', function () {
		const instantiationService = workbenchInstantiationService();
		const service: NextEditorService = <any>instantiationService.createInstance(NextEditorService);

		// Cached Input (Files)
		const fileResource1 = toFileResource(this, '/foo/bar/cache1.js');
		const fileInput1 = service.createInput({ resource: fileResource1 });
		assert.ok(fileInput1);

		const fileResource2 = toFileResource(this, '/foo/bar/cache2.js');
		const fileInput2 = service.createInput({ resource: fileResource2 });
		assert.ok(fileInput2);

		assert.notEqual(fileInput1, fileInput2);

		const fileInput1Again = service.createInput({ resource: fileResource1 });
		assert.equal(fileInput1Again, fileInput1);

		fileInput1Again.dispose();

		assert.ok(fileInput1.isDisposed());

		const fileInput1AgainAndAgain = service.createInput({ resource: fileResource1 });
		assert.notEqual(fileInput1AgainAndAgain, fileInput1);
		assert.ok(!fileInput1AgainAndAgain.isDisposed());

		// Cached Input (Resource)
		const resource1 = toResource.call(this, '/foo/bar/cache1.js');
		const input1 = service.createInput({ resource: resource1 });
		assert.ok(input1);

		const resource2 = toResource.call(this, '/foo/bar/cache2.js');
		const input2 = service.createInput({ resource: resource2 });
		assert.ok(input2);

		assert.notEqual(input1, input2);

		const input1Again = service.createInput({ resource: resource1 });
		assert.equal(input1Again, input1);

		input1Again.dispose();

		assert.ok(input1.isDisposed());

		const input1AgainAndAgain = service.createInput({ resource: resource1 });
		assert.notEqual(input1AgainAndAgain, input1);
		assert.ok(!input1AgainAndAgain.isDisposed());
	});

	test('delegate', function (done) {
		const instantiationService = workbenchInstantiationService();

		class MyEditor extends BaseEditor {

			constructor(id: string) {
				super(id, null, new TestThemeService());
			}

			getId(): string {
				return 'myEditor';
			}

			public layout(): void {

			}

			public createEditor(): any {

			}
		}

		const ed = instantiationService.createInstance(MyEditor, 'my.editor');

		const inp = instantiationService.createInstance(ResourceEditorInput, 'name', 'description', URI.parse('my://resource'));
		const delegate = instantiationService.createInstance(DelegatingWorkbenchEditorService);
		delegate.setEditorOpenHandler((group: INextEditorGroup, input: IEditorInput, options?: EditorOptions) => {
			assert.strictEqual(input, inp);

			done();

			return TPromise.as(ed);
		});

		delegate.openEditor(inp);
	});
});

function toResource(path: string) {
	return URI.from({ scheme: 'custom', path });
}

function toFileResource(self: any, path: string) {
	return URI.file(paths.join('C:\\', Buffer.from(self.test.fullTitle()).toString('base64'), path));
}

Registry.as<IEditorRegistry>(Extensions.Editors).registerEditor(new EditorDescriptor(TestEditorControl, 'MyTestFileEditorForNextEditorService', 'My Test File Editor For Next Editor Service'), new SyncDescriptor(TestEditorInput));
