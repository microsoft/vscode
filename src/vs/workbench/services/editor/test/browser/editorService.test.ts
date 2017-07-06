/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import paths = require('vs/base/common/paths');
import { Position, Direction, IEditor } from 'vs/platform/editor/common/editor';
import URI from 'vs/base/common/uri';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorInput, EditorOptions, TextEditorOptions } from 'vs/workbench/common/editor';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import { DelegatingWorkbenchEditorService, WorkbenchEditorService, IEditorPart } from 'vs/workbench/services/editor/browser/editorService';
import { UntitledEditorInput } from 'vs/workbench/common/editor/untitledEditorInput';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';

let activeEditor: BaseEditor = <any>{
	getSelection: function () {
		return 'test.selection';
	}
};

let openedEditorInput;
let openedEditorOptions;
let openedEditorPosition;

function toResource(path) {
	return URI.from({ scheme: 'custom', path });
}

function toFileResource(path) {
	return URI.file(paths.join('C:\\', new Buffer(this.test.fullTitle()).toString('base64'), path));
}

class TestEditorPart implements IEditorPart {
	private activeInput;

	public getId(): string {
		return null;
	}

	public openEditors(args: any[]): Promise {
		return TPromise.as([]);
	}

	public replaceEditors(editors: { toReplace: EditorInput, replaceWith: EditorInput, options?: any }[]): TPromise<BaseEditor[]> {
		return TPromise.as([]);
	}

	public closeEditors(position: Position, filter?: { except?: EditorInput, direction?: Direction, unmodifiedOnly?: boolean }): TPromise<void> {
		return TPromise.as(null);
	}

	public closeAllEditors(except?: Position): TPromise<void> {
		return TPromise.as(null);
	}

	public closeEditor(position: Position, input: EditorInput): TPromise<void> {
		return TPromise.as(null);
	}

	public openEditor(input?: EditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<BaseEditor>;
	public openEditor(input?: EditorInput, options?: EditorOptions, position?: Position): TPromise<BaseEditor>;
	public openEditor(input?: EditorInput, options?: EditorOptions, arg?: any): TPromise<BaseEditor> {
		openedEditorInput = input;
		openedEditorOptions = options;
		openedEditorPosition = arg;

		return TPromise.as(activeEditor);
	}

	public getActiveEditor(): BaseEditor {
		return activeEditor;
	}

	public setActiveEditorInput(input: EditorInput) {
		this.activeInput = input;
	}

	public getActiveEditorInput(): EditorInput {
		return this.activeInput;
	}

	public getVisibleEditors(): IEditor[] {
		return [activeEditor];
	}
}

suite('WorkbenchEditorService', () => {

	test('basics', function () {
		let instantiationService = workbenchInstantiationService();

		let activeInput: EditorInput = instantiationService.createInstance(FileEditorInput, toFileResource.call(this, '/something.js'), void 0);

		let testEditorPart = new TestEditorPart();
		testEditorPart.setActiveEditorInput(activeInput);
		let service: WorkbenchEditorService = <any>instantiationService.createInstance(<any>WorkbenchEditorService, testEditorPart);

		assert.strictEqual(service.getActiveEditor(), activeEditor);
		assert.strictEqual(service.getActiveEditorInput(), activeInput);

		// Open EditorInput
		service.openEditor(activeInput, null).then((editor) => {
			assert.strictEqual(openedEditorInput, activeInput);
			assert.strictEqual(openedEditorOptions, null);
			assert.strictEqual(editor, activeEditor);
			assert.strictEqual(service.getVisibleEditors().length, 1);
			assert(service.getVisibleEditors()[0] === editor);
		});

		service.openEditor(activeInput, null, Position.ONE).then((editor) => {
			assert.strictEqual(openedEditorInput, activeInput);
			assert.strictEqual(openedEditorOptions, null);
			assert.strictEqual(editor, activeEditor);
			assert.strictEqual(service.getVisibleEditors().length, 1);
			assert(service.getVisibleEditors()[0] === editor);
		});

		// Open Untyped Input (file)
		service.openEditor({ resource: toFileResource.call(this, '/index.html'), options: { selection: { startLineNumber: 1, startColumn: 1 } } }).then((editor) => {
			assert.strictEqual(editor, activeEditor);

			assert(openedEditorInput instanceof FileEditorInput);
			let contentInput = <FileEditorInput>openedEditorInput;
			assert.strictEqual(contentInput.getResource().fsPath, toFileResource.call(this, '/index.html').fsPath);

			assert(openedEditorOptions instanceof TextEditorOptions);
			let textEditorOptions = <TextEditorOptions>openedEditorOptions;
			assert(textEditorOptions.hasOptionsDefined());
		});

		// Open Untyped Input (file, encoding)
		service.openEditor({ resource: toFileResource.call(this, '/index.html'), encoding: 'utf16le', options: { selection: { startLineNumber: 1, startColumn: 1 } } }).then((editor) => {
			assert.strictEqual(editor, activeEditor);

			assert(openedEditorInput instanceof FileEditorInput);
			let contentInput = <FileEditorInput>openedEditorInput;
			assert.equal(contentInput.getPreferredEncoding(), 'utf16le');
		});

		// Open Untyped Input (untitled)
		service.openEditor({ options: { selection: { startLineNumber: 1, startColumn: 1 } } }).then((editor) => {
			assert.strictEqual(editor, activeEditor);

			assert(openedEditorInput instanceof UntitledEditorInput);

			assert(openedEditorOptions instanceof TextEditorOptions);
			let textEditorOptions = <TextEditorOptions>openedEditorOptions;
			assert(textEditorOptions.hasOptionsDefined());
		});

		// Open Untyped Input (untitled with contents)
		service.openEditor({ contents: 'Hello Untitled', options: { selection: { startLineNumber: 1, startColumn: 1 } } }).then((editor) => {
			assert.strictEqual(editor, activeEditor);

			assert(openedEditorInput instanceof UntitledEditorInput);

			const untitledInput = openedEditorInput as UntitledEditorInput;
			untitledInput.resolve().then(model => {
				assert.equal(model.getValue(), 'Hello Untitled');
			});
		});

		// Open Untyped Input (untitled with file path)
		service.openEditor({ filePath: '/some/path.txt', options: { selection: { startLineNumber: 1, startColumn: 1 } } }).then((editor) => {
			assert.strictEqual(editor, activeEditor);

			assert(openedEditorInput instanceof UntitledEditorInput);

			const untitledInput = openedEditorInput as UntitledEditorInput;
			assert.ok(untitledInput.hasAssociatedFilePath);
		});
	});

	test('caching', function () {
		let instantiationService = workbenchInstantiationService();

		let activeInput: EditorInput = instantiationService.createInstance(FileEditorInput, toFileResource.call(this, '/something.js'), void 0);

		let testEditorPart = new TestEditorPart();
		testEditorPart.setActiveEditorInput(activeInput);
		let service: WorkbenchEditorService = <any>instantiationService.createInstance(<any>WorkbenchEditorService, testEditorPart);

		// Cached Input (Files)
		const fileResource1 = toFileResource.call(this, '/foo/bar/cache1.js');
		const fileInput1 = service.createInput({ resource: fileResource1 });
		assert.ok(fileInput1);

		const fileResource2 = toFileResource.call(this, '/foo/bar/cache2.js');
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
		let instantiationService = workbenchInstantiationService();
		let activeInput: EditorInput = instantiationService.createInstance(FileEditorInput, toFileResource.call(this, '/something.js'), void 0);

		let testEditorPart = new TestEditorPart();
		testEditorPart.setActiveEditorInput(activeInput);

		instantiationService.createInstance(<any>WorkbenchEditorService, testEditorPart);
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
		let ed = instantiationService.createInstance(MyEditor, 'my.editor');

		let inp = instantiationService.createInstance(ResourceEditorInput, 'name', 'description', URI.parse('my://resource'));
		let delegate = instantiationService.createInstance(DelegatingWorkbenchEditorService);
		delegate.setEditorOpenHandler((input, options?) => {
			assert.strictEqual(input, inp);

			return TPromise.as(ed);
		});

		delegate.setEditorCloseHandler((position, input) => {
			assert.strictEqual(input, inp);

			done();

			return TPromise.as(void 0);
		});

		delegate.openEditor(inp);
		delegate.closeEditor(0, inp);
	});
});
