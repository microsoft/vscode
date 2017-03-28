/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { ExtHostDocuments } from 'vs/workbench/api/node/extHostDocuments';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/node/extHostDocumentsAndEditors';
import { TextDocumentSaveReason, TextEdit, Position, EndOfLine } from 'vs/workbench/api/node/extHostTypes';
import { MainThreadWorkspaceShape } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostDocumentSaveParticipant } from 'vs/workbench/api/node/extHostDocumentSaveParticipant';
import { OneGetThreadService } from './testThreadService';
import { IResourceEdit } from 'vs/editor/common/services/bulkEdit';
import { SaveReason } from 'vs/workbench/services/textfile/common/textfiles';
import * as vscode from 'vscode';

suite('ExtHostDocumentSaveParticipant', () => {

	let resource = URI.parse('foo:bar');
	let workspace = new class extends MainThreadWorkspaceShape { };
	let documents: ExtHostDocuments;

	setup(() => {
		const documentsAndEditors = new ExtHostDocumentsAndEditors(OneGetThreadService(null));
		documentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [{
				isDirty: false,
				modeId: 'foo',
				url: resource,
				versionId: 1,
				lines: ['foo'],
				EOL: '\n',
			}]
		});
		documents = new ExtHostDocuments(OneGetThreadService(null), documentsAndEditors);
	});

	test('no listeners, no problem', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace);
		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => assert.ok(true));
	});

	test('event delivery', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace);

		let event: vscode.TextDocumentWillSaveEvent;
		let sub = participant.onWillSaveTextDocumentEvent(function (e) {
			event = e;
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			sub.dispose();

			assert.ok(event);
			assert.equal(event.reason, TextDocumentSaveReason.Manual);
			assert.equal(typeof event.waitUntil, 'function');
		});
	});

	test('event delivery, immutable', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace);

		let event: vscode.TextDocumentWillSaveEvent;
		let sub = participant.onWillSaveTextDocumentEvent(function (e) {
			event = e;
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			sub.dispose();

			assert.ok(event);
			assert.throws(() => event.document = null);
		});
	});

	test('event delivery, bad listener', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace);

		let sub = participant.onWillSaveTextDocumentEvent(function (e) {
			throw new Error('💀');
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(values => {
			sub.dispose();

			const [first] = values;
			assert.equal(first, false);
		});
	});

	test('event delivery, bad listener doesn\'t prevent more events', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace);

		let sub1 = participant.onWillSaveTextDocumentEvent(function (e) {
			throw new Error('💀');
		});
		let event: vscode.TextDocumentWillSaveEvent;
		let sub2 = participant.onWillSaveTextDocumentEvent(function (e) {
			event = e;
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			sub1.dispose();
			sub2.dispose();

			assert.ok(event);
		});
	});

	test('event delivery, in subscriber order', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace);

		let counter = 0;
		let sub1 = participant.onWillSaveTextDocumentEvent(function (event) {
			assert.equal(counter++, 0);
		});

		let sub2 = participant.onWillSaveTextDocumentEvent(function (event) {
			assert.equal(counter++, 1);
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			sub1.dispose();
			sub2.dispose();
		});
	});

	test('event delivery, ignore bad listeners', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace, { timeout: 5, errors: 1 });

		let callCount = 0;
		let sub = participant.onWillSaveTextDocumentEvent(function (event) {
			callCount += 1;
			throw new Error('boom');
		});

		return TPromise.join([
			participant.$participateInSave(resource, SaveReason.EXPLICIT),
			participant.$participateInSave(resource, SaveReason.EXPLICIT),
			participant.$participateInSave(resource, SaveReason.EXPLICIT),
			participant.$participateInSave(resource, SaveReason.EXPLICIT)

		]).then(values => {
			sub.dispose();
			assert.equal(callCount, 2);
		});
	});

	test('event delivery, overall timeout', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace, { timeout: 20, errors: 5 });

		let callCount = 0;
		let sub1 = participant.onWillSaveTextDocumentEvent(function (event) {
			callCount += 1;
			event.waitUntil(TPromise.timeout(17));
		});

		let sub2 = participant.onWillSaveTextDocumentEvent(function (event) {
			callCount += 1;
			event.waitUntil(TPromise.timeout(17));
		});

		let sub3 = participant.onWillSaveTextDocumentEvent(function (event) {
			callCount += 1;
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(values => {
			sub1.dispose();
			sub2.dispose();
			sub3.dispose();

			assert.equal(callCount, 2);
			assert.equal(values.length, 2);
		});
	});

	test('event delivery, waitUntil', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace);

		let sub = participant.onWillSaveTextDocumentEvent(function (event) {

			event.waitUntil(TPromise.timeout(10));
			event.waitUntil(TPromise.timeout(10));
			event.waitUntil(TPromise.timeout(10));
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			sub.dispose();
		});

	});

	test('event delivery, waitUntil must be called sync', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace);

		let sub = participant.onWillSaveTextDocumentEvent(function (event) {

			event.waitUntil(new TPromise((resolve, reject) => {
				setTimeout(() => {
					try {
						assert.throws(() => event.waitUntil(TPromise.timeout(10)));
						resolve(void 0);
					} catch (e) {
						reject(e);
					}

				}, 10);
			}));
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			sub.dispose();
		});
	});

	test('event delivery, waitUntil will timeout', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace, { timeout: 5, errors: 3 });

		let sub = participant.onWillSaveTextDocumentEvent(function (event) {
			event.waitUntil(TPromise.timeout(15));
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(values => {
			sub.dispose();

			const [first] = values;
			assert.equal(first, false);
		});
	});

	test('event delivery, waitUntil failure handling', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace);

		let sub1 = participant.onWillSaveTextDocumentEvent(function (e) {
			e.waitUntil(TPromise.wrapError('dddd'));
		});

		let event: vscode.TextDocumentWillSaveEvent;
		let sub2 = participant.onWillSaveTextDocumentEvent(function (e) {
			event = e;
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			assert.ok(event);
			sub1.dispose();
			sub2.dispose();
		});
	});

	test('event delivery, pushEdits sync', () => {

		let edits: IResourceEdit[];
		const participant = new ExtHostDocumentSaveParticipant(documents, new class extends MainThreadWorkspaceShape {
			$applyWorkspaceEdit(_edits) {
				edits = _edits;
				return TPromise.as(true);
			}
		});

		let sub = participant.onWillSaveTextDocumentEvent(function (e) {
			e.waitUntil(TPromise.as([TextEdit.insert(new Position(0, 0), 'bar')]));
			e.waitUntil(TPromise.as([TextEdit.setEndOfLine(EndOfLine.CRLF)]));
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			sub.dispose();

			assert.equal(edits.length, 2);
		});
	});

	test('event delivery, concurrent change', () => {

		let edits: IResourceEdit[];
		const participant = new ExtHostDocumentSaveParticipant(documents, new class extends MainThreadWorkspaceShape {
			$applyWorkspaceEdit(_edits) {
				edits = _edits;
				return TPromise.as(true);
			}
		});

		let sub = participant.onWillSaveTextDocumentEvent(function (e) {

			// concurrent change from somewhere
			documents.$acceptModelChanged(resource.toString(), [{
				versionId: 2,
				range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
				text: 'bar',
				rangeLength: undefined, eol: undefined, isRedoing: undefined, isUndoing: undefined,
			}], true);

			e.waitUntil(TPromise.as([TextEdit.insert(new Position(0, 0), 'bar')]));
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(values => {
			sub.dispose();

			assert.equal(edits, undefined);
			assert.equal(values[0], false);
		});

	});

	test('event delivery, two listeners -> two document states', () => {

		const participant = new ExtHostDocumentSaveParticipant(documents, new class extends MainThreadWorkspaceShape {
			$applyWorkspaceEdit(_edits: IResourceEdit[]) {

				for (const { resource, newText, range } of _edits) {
					documents.$acceptModelChanged(resource.toString(), [{
						range,
						text: newText,
						versionId: documents.getDocumentData(resource).version + 1,
						rangeLength: undefined, eol: undefined, isRedoing: undefined, isUndoing: undefined,
					}], true);
				}
				return TPromise.as(true);
			}
		});

		const document = documents.getDocumentData(resource).document;

		let sub1 = participant.onWillSaveTextDocumentEvent(function (e) {
			// the document state we started with
			assert.equal(document.version, 1);
			assert.equal(document.getText(), 'foo');

			e.waitUntil(TPromise.as([TextEdit.insert(new Position(0, 0), 'bar')]));
		});

		let sub2 = participant.onWillSaveTextDocumentEvent(function (e) {
			// the document state AFTER the first listener kicked in
			assert.equal(document.version, 2);
			assert.equal(document.getText(), 'barfoo');

			e.waitUntil(TPromise.as([TextEdit.insert(new Position(0, 0), 'bar')]));
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(values => {
			sub1.dispose();
			sub2.dispose();

			// the document state AFTER eventing is done
			assert.equal(document.version, 3);
			assert.equal(document.getText(), 'barbarfoo');
		});

	});
});
