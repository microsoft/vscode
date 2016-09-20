/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {ExtHostDocuments} from 'vs/workbench/api/node/extHostDocuments';
import {TextEdit, Position} from 'vs/workbench/api/node/extHostTypes';
import {MainThreadWorkspaceShape} from 'vs/workbench/api/node/extHost.protocol';
import {ExtHostDocumentSaveParticipant, TextDocumentWillSaveEvent} from 'vs/workbench/api/node/extHostDocumentSaveParticipant';
import {OneGetThreadService} from './testThreadService';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import {IResourceEdit} from 'vs/editor/common/services/bulkEdit';

suite('ExtHostDocumentSaveParticipant', () => {

	let resource = URI.parse('foo:bar');
	let workspace = new class extends MainThreadWorkspaceShape { };
	let documents: ExtHostDocuments;

	setup(() => {

		documents = new ExtHostDocuments(OneGetThreadService(null));
		documents.$acceptModelAdd({
			isDirty: false,
			modeId: 'foo',
			url: resource,
			versionId: 1,
			value: {
				EOL: '\n',
				lines: ['foo'],
				BOM: '',
				length: -1,
				options: {
					tabSize: 4,
					insertSpaces: true,
					trimAutoWhitespace: true,
					defaultEOL: EditorCommon.DefaultEndOfLine.LF
				}
			}
		});
	});

	test('no listeners, no problem', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace);
		return participant.$participateInSave(resource).then(() => assert.ok(true));
	});

	test('event delivery', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace);

		let event: TextDocumentWillSaveEvent;
		let sub = participant.onWillSaveTextDocumentEvent(function (e) {
			event = e;
		});

		return participant.$participateInSave(resource).then(() => {
			sub.dispose();

			assert.ok(event);
			assert.equal(typeof event.waitUntil, 'function');
		});
	});

	test('event delivery, immutable', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace);

		let event: TextDocumentWillSaveEvent;
		let sub = participant.onWillSaveTextDocumentEvent(function (e) {
			event = e;
		});

		return participant.$participateInSave(resource).then(() => {
			sub.dispose();

			assert.ok(event);
			assert.throws(() => event.document = null);
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

		return participant.$participateInSave(resource).then(() => {
			sub1.dispose();
			sub2.dispose();
		});
	});

	test('event delivery, waitUntil', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace);

		let sub = participant.onWillSaveTextDocumentEvent(function (event) {

			event.waitUntil(TPromise.timeout(10));
			event.waitUntil(TPromise.timeout(10));
			event.waitUntil(TPromise.timeout(10));
		});

		return participant.$participateInSave(resource).then(() => {
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

		return participant.$participateInSave(resource).then(() => {
			sub.dispose();
		});
	});

	test('event delivery, waitUntil failure handling', () => {
		const participant = new ExtHostDocumentSaveParticipant(documents, workspace);

		let sub1 = participant.onWillSaveTextDocumentEvent(function (e) {
			e.waitUntil(TPromise.wrapError('dddd'));
		});

		let event: TextDocumentWillSaveEvent;
		let sub2 = participant.onWillSaveTextDocumentEvent(function (e) {
			event = e;
		});

		return participant.$participateInSave(resource).then(() => {
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
			e.pushEdits([TextEdit.insert(new Position(0, 0), 'bar')]);
		});

		return participant.$participateInSave(resource).then(() => {
			sub.dispose();

			assert.equal(edits.length, 1);
		});
	});
});
