/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { ExtHostDocumentData } from 'vs/workbench/api/node/extHostDocumentData';
import { ITextEditorAddData } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/node/extHostDocumentsAndEditors';
import { OneGetThreadService } from './testThreadService';
import { Model } from 'vs/editor/common/model/model';

suite('ExtHostDocumentsAndEditors', () => {

	function modelAddData(model: Model) {
		return {
			isDirty: false,
			versionId: model.getVersionId(),
			modeId: model.getLanguageIdentifier().language,
			url: model.uri,
			lines: model.getValue().split(model.getEOL()),
			EOL: model.getEOL(),
		};
	}

	function editorAddData(model: Model, id = model.id): ITextEditorAddData {
		return {
			id,
			document: model.uri,
			options: { tabSize: 4, insertSpaces: true, cursorStyle: 0, lineNumbers: 0 },
			selections: [],
			editorPosition: 1
		};
	}

	let documentsAndEditors: ExtHostDocumentsAndEditors;

	setup(() => {
		documentsAndEditors = new ExtHostDocumentsAndEditors(OneGetThreadService(null));
	});

	test('onDidChangeVisibleTextDocuments, new document => no event', () => {

		const model = Model.createFromString('foo', undefined, undefined, URI.parse('foo:bar'));

		let docs: ExtHostDocumentData[] = [];
		let sub = documentsAndEditors.onDidChangeVisibleTextDocuments(e => docs.push(null));

		documentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [modelAddData(model)]
		});

		assert.equal(docs.length, 0);
		sub.dispose();
	});

	test('onDidChangeVisibleTextDocuments, new editor => event', () => {

		const model = Model.createFromString('foo', undefined, undefined, URI.parse('foo:bar'));

		let docs: ExtHostDocumentData[] = [];
		let sub = documentsAndEditors.onDidChangeVisibleTextDocuments(e => docs.push(...e));

		documentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [modelAddData(model)]
		});

		assert.equal(docs.length, 0);

		documentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedEditors: [editorAddData(model)]
		});

		assert.equal(docs.length, 1);
		assert.equal(docs[0].document.uri.toString(), model.uri.toString());

		sub.dispose();
	});

	test('onDidChangeVisibleTextDocuments, removed editor => event', () => {

		const model = Model.createFromString('foo', undefined, undefined, URI.parse('foo:bar'));

		documentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [modelAddData(model)],
			addedEditors: [editorAddData(model)]
		});

		const all = documentsAndEditors.allDocuments();
		assert.equal(1, all.length);
		assert.equal(all[0].document.isVisible, true);

		let docs: ExtHostDocumentData[] = [];
		let sub = documentsAndEditors.onDidChangeVisibleTextDocuments(e => docs.push(...e));

		documentsAndEditors.$acceptDocumentsAndEditorsDelta({
			removedEditors: [model.id]
		});

		assert.equal(docs.length, 1);
		assert.equal(docs[0].document.uri.toString(), model.uri.toString());
		assert.equal(docs[0].document.isVisible, false);

		sub.dispose();
	});


	test('onDidChangeVisibleTextDocuments, removed/added editor => event', () => {

		const model1 = Model.createFromString('foo', undefined, undefined, URI.parse('foo:bar'));
		const model2 = Model.createFromString('foo', undefined, undefined, URI.parse('foo:bar2'));

		documentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [modelAddData(model1)],
			addedEditors: [editorAddData(model1, 'left')]
		});

		const all = documentsAndEditors.allDocuments();
		assert.equal(1, all.length);
		assert.equal(all[0].document.isVisible, true);

		let docs: ExtHostDocumentData[] = [];
		let sub = documentsAndEditors.onDidChangeVisibleTextDocuments(e => docs.push(...e));


		// left gets a new editor and right get the document from left
		documentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [modelAddData(model2)],
			addedEditors: [editorAddData(model2, 'newLeft'), editorAddData(model1, 'right')],
			removedEditors: ['left']
		});

		assert.equal(docs.length, 2);

		let [left, right] = docs;
		assert.equal(left.document.isVisible, true);
		assert.equal(right.document.isVisible, true);

		sub.dispose();
	});

});
