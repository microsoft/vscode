/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { MainThreadDocumentsAndEditors } from 'vs/workbench/api/electron-browser/mainThreadDocumentsAndEditors';
import { OneGetThreadService } from './testThreadService';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { MockCodeEditorService } from 'vs/editor/test/common/mocks/mockCodeEditorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ExtHostDocumentsAndEditorsShape, IDocumentsAndEditorsDelta } from 'vs/workbench/api/node/extHost.protocol';
import { mockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import { mock } from 'vs/workbench/test/electron-browser/api/mock';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import Event from 'vs/base/common/event';

suite('MainThreadDocumentsAndEditors', () => {

	let modelService: ModelServiceImpl;
	let codeEditorService: MockCodeEditorService;
	let textFileService: ITextFileService;
	let workbenchEditorService: IWorkbenchEditorService;
	let documentAndEditor: MainThreadDocumentsAndEditors;
	let deltas: IDocumentsAndEditorsDelta[] = [];
	const hugeModelString = new Array(2 + (50 * 1024 * 1024)).join('-');

	setup(() => {
		deltas.length = 0;
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('editor', { 'detectIndentation': false });
		modelService = new ModelServiceImpl(null, configService);
		codeEditorService = new MockCodeEditorService();
		textFileService = new class extends mock<ITextFileService>() {
			isDirty() { return false; };
			models = <any>{
				onModelSaved: Event.None,
				onModelReverted: Event.None,
				onModelDirty: Event.None,
			};
		};
		workbenchEditorService = <IWorkbenchEditorService>{
			getVisibleEditors() { return []; },
			getActiveEditor() { return undefined; }
		};
		const editorGroupService = new class extends mock<IEditorGroupService>() {
			onEditorsChanged = Event.None;
			onEditorsMoved = Event.None;
		};

		documentAndEditor = new MainThreadDocumentsAndEditors(
			OneGetThreadService(new class extends mock<ExtHostDocumentsAndEditorsShape>() {
				$acceptDocumentsAndEditorsDelta(delta) { deltas.push(delta); }
			}),
			modelService,
			textFileService,
			workbenchEditorService,
			codeEditorService,
			null,
			null,
			null,
			null,
			editorGroupService,
			null
		);
	});


	test('Model#add', () => {
		deltas.length = 0;

		modelService.createModel('farboo', null, null);

		assert.equal(deltas.length, 1);
		const [delta] = deltas;

		assert.equal(delta.addedDocuments.length, 1);
		assert.equal(delta.removedDocuments, undefined);
		assert.equal(delta.addedEditors, undefined);
		assert.equal(delta.removedEditors, undefined);
		assert.equal(delta.newActiveEditor, null);
	});

	test('ignore huge model', function () {
		this.timeout(1000 * 60); // increase timeout for this one test

		const model = modelService.createModel(hugeModelString, null, null);
		assert.ok(model.isTooLargeForHavingARichMode());

		assert.equal(deltas.length, 1);
		const [delta] = deltas;
		assert.equal(delta.newActiveEditor, null);
		assert.equal(delta.addedDocuments, undefined);
		assert.equal(delta.removedDocuments, undefined);
		assert.equal(delta.addedEditors, undefined);
		assert.equal(delta.removedEditors, undefined);
	});

	test('ignore huge model from editor', function () {
		this.timeout(1000 * 60); // increase timeout for this one test

		const model = modelService.createModel(hugeModelString, null, null);
		const editor = mockCodeEditor(null, { model, wordWrap: 'off', wordWrapMinified: false });

		assert.equal(deltas.length, 1);
		deltas.length = 0;
		codeEditorService.addCodeEditor(editor);
		assert.equal(deltas.length, 0);
	});

	test('ignore editor w/o model', () => {
		const editor = mockCodeEditor([], {});
		editor.setModel(null);
		codeEditorService.addCodeEditor(editor);
		assert.equal(deltas.length, 1);
		const [delta] = deltas;
		assert.equal(delta.newActiveEditor, null);
		assert.equal(delta.addedDocuments, undefined);
		assert.equal(delta.removedDocuments, undefined);
		assert.equal(delta.addedEditors, undefined);
		assert.equal(delta.removedEditors, undefined);
	});

	test('editor with model', () => {
		deltas.length = 0;

		const model = modelService.createModel('farboo', null, null);
		codeEditorService.addCodeEditor(mockCodeEditor(null, { model }));

		assert.equal(deltas.length, 2);
		const [first, second] = deltas;
		assert.equal(first.addedDocuments.length, 1);
		assert.equal(first.newActiveEditor, null);
		assert.equal(first.removedDocuments, undefined);
		assert.equal(first.addedEditors, undefined);
		assert.equal(first.removedEditors, undefined);

		assert.equal(second.addedEditors.length, 1);
		assert.equal(second.addedDocuments, undefined);
		assert.equal(second.removedDocuments, undefined);
		assert.equal(second.removedEditors, undefined);
		assert.equal(typeof second.newActiveEditor, 'string');
	});

	test('editor with dispos-ed/-ing model', () => {
		modelService.createModel('foobar', null, null);
		const model = modelService.createModel('farboo', null, null);
		const editor = mockCodeEditor(null, { model });
		codeEditorService.addCodeEditor(editor);

		// ignore things until now
		deltas.length = 0;

		modelService.destroyModel(model.uri);
		assert.equal(deltas.length, 1);
		const [first] = deltas;
		assert.equal(first.newActiveEditor, null);
		assert.equal(first.removedEditors.length, 1);
		assert.equal(first.removedDocuments.length, 1);
		assert.equal(first.addedDocuments, undefined);
		assert.equal(first.addedEditors, undefined);
	});
});
