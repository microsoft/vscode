/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { TextDocumentSaveReason, TextEdit, Position, EndOfLine } from '../../common/extHostTypes.js';
import { MainThreadTextEditorsShape, IWorkspaceEditDto, IWorkspaceTextEditDto, MainThreadBulkEditsShape } from '../../common/extHost.protocol.js';
import { ExtHostDocumentSaveParticipant } from '../../common/extHostDocumentSaveParticipant.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { SaveReason } from '../../../common/editor.js';
import type * as vscode from 'vscode';
import { mock } from '../../../../base/test/common/mock.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';

function timeout(n: number) {
	return new Promise(resolve => setTimeout(resolve, n));
}

suite('ExtHostDocumentSaveParticipant', () => {

	const resource = URI.parse('foo:bar');
	const mainThreadBulkEdits = new class extends mock<MainThreadBulkEditsShape>() { };
	let documents: ExtHostDocuments;
	const nullLogService = new NullLogService();

	setup(() => {
		const documentsAndEditors = new ExtHostDocumentsAndEditors(SingleProxyRPCProtocol(null), new NullLogService());
		documentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [{
				isDirty: false,
				languageId: 'foo',
				uri: resource,
				versionId: 1,
				lines: ['foo'],
				EOL: '\n',
				encoding: 'utf8'
			}]
		});
		documents = new ExtHostDocuments(SingleProxyRPCProtocol(null), documentsAndEditors);
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('no listeners, no problem', () => {
		const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => assert.ok(true));
	});

	test('event delivery', () => {
		const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);

		let event: vscode.TextDocumentWillSaveEvent;
		const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
			event = e;
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			sub.dispose();

			assert.ok(event);
			assert.strictEqual(event.reason, TextDocumentSaveReason.Manual);
			assert.strictEqual(typeof event.waitUntil, 'function');
		});
	});

	test('event delivery, immutable', () => {
		const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);

		let event: vscode.TextDocumentWillSaveEvent;
		const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
			event = e;
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			sub.dispose();

			assert.ok(event);
			assert.throws(() => { (event.document as any) = null!; });
		});
	});

	test('event delivery, bad listener', () => {
		const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);

		const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
			throw new Error('💀');
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(values => {
			sub.dispose();

			const [first] = values;
			assert.strictEqual(first, false);
		});
	});

	test('event delivery, bad listener doesn\'t prevent more events', () => {
		const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);

		const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
			throw new Error('💀');
		});
		let event: vscode.TextDocumentWillSaveEvent;
		const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
			event = e;
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			sub1.dispose();
			sub2.dispose();

			assert.ok(event);
		});
	});

	test('event delivery, in subscriber order', () => {
		const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);

		let counter = 0;
		const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
			assert.strictEqual(counter++, 0);
		});

		const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
			assert.strictEqual(counter++, 1);
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			sub1.dispose();
			sub2.dispose();
		});
	});

	test('event delivery, ignore bad listeners', async () => {
		const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits, { timeout: 5, errors: 1 });

		let callCount = 0;
		const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
			callCount += 1;
			throw new Error('boom');
		});

		await participant.$participateInSave(resource, SaveReason.EXPLICIT);
		await participant.$participateInSave(resource, SaveReason.EXPLICIT);
		await participant.$participateInSave(resource, SaveReason.EXPLICIT);
		await participant.$participateInSave(resource, SaveReason.EXPLICIT);

		sub.dispose();
		assert.strictEqual(callCount, 2);
	});

	test('event delivery, overall timeout', async function () {
		const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits, { timeout: 20, errors: 5 });

		// let callCount = 0;
		const calls: number[] = [];
		const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
			calls.push(1);
		});

		const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
			calls.push(2);
			event.waitUntil(timeout(100));
		});

		const sub3 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
			calls.push(3);
		});

		const values = await participant.$participateInSave(resource, SaveReason.EXPLICIT);
		sub1.dispose();
		sub2.dispose();
		sub3.dispose();
		assert.deepStrictEqual(calls, [1, 2]);
		assert.strictEqual(values.length, 2);
	});

	test('event delivery, waitUntil', () => {
		const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);

		const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {

			event.waitUntil(timeout(10));
			event.waitUntil(timeout(10));
			event.waitUntil(timeout(10));
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			sub.dispose();
		});

	});

	test('event delivery, waitUntil must be called sync', () => {
		const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);

		const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {

			event.waitUntil(new Promise<undefined>((resolve, reject) => {
				setTimeout(() => {
					try {
						assert.throws(() => event.waitUntil(timeout(10)));
						resolve(undefined);
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

	test('event delivery, waitUntil will timeout', function () {

		const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits, { timeout: 5, errors: 3 });

		const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (event) {
			event.waitUntil(timeout(100));
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(values => {
			sub.dispose();

			const [first] = values;
			assert.strictEqual(first, false);
		});
	});

	test('event delivery, waitUntil failure handling', () => {
		const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);

		const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
			e.waitUntil(Promise.reject(new Error('dddd')));
		});

		let event: vscode.TextDocumentWillSaveEvent;
		const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
			event = e;
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			assert.ok(event);
			sub1.dispose();
			sub2.dispose();
		});
	});

	test('event delivery, pushEdits sync', () => {

		let dto: IWorkspaceEditDto;
		const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, new class extends mock<MainThreadTextEditorsShape>() {
			$tryApplyWorkspaceEdit(_edits: SerializableObjectWithBuffers<IWorkspaceEditDto>) {
				dto = _edits.value;
				return Promise.resolve(true);
			}
		});

		const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
			e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), 'bar')]));
			e.waitUntil(Promise.resolve([TextEdit.setEndOfLine(EndOfLine.CRLF)]));
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			sub.dispose();

			assert.strictEqual(dto.edits.length, 2);
			assert.ok((<IWorkspaceTextEditDto>dto.edits[0]).textEdit);
			assert.ok((<IWorkspaceTextEditDto>dto.edits[1]).textEdit);
		});
	});

	test('event delivery, concurrent change', () => {

		let edits: IWorkspaceEditDto;
		const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, new class extends mock<MainThreadTextEditorsShape>() {
			$tryApplyWorkspaceEdit(_edits: SerializableObjectWithBuffers<IWorkspaceEditDto>) {
				edits = _edits.value;
				return Promise.resolve(true);
			}
		});

		const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {

			// concurrent change from somewhere
			documents.$acceptModelChanged(resource, {
				changes: [{
					range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
					rangeOffset: undefined!,
					rangeLength: undefined!,
					text: 'bar'
				}],
				eol: undefined!,
				versionId: 2,
				isRedoing: false,
				isUndoing: false,
				detailedReason: undefined,
				isFlush: false,
				isEolChange: false,
			}, true);

			e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), 'bar')]));
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(values => {
			sub.dispose();

			assert.strictEqual(edits, undefined);
			assert.strictEqual(values[0], false);
		});

	});

	test('event delivery, two listeners -> two document states', () => {

		const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, new class extends mock<MainThreadTextEditorsShape>() {
			$tryApplyWorkspaceEdit(dto: SerializableObjectWithBuffers<IWorkspaceEditDto>) {

				for (const edit of dto.value.edits) {

					const uri = URI.revive((<IWorkspaceTextEditDto>edit).resource);
					const { text, range } = (<IWorkspaceTextEditDto>edit).textEdit;
					documents.$acceptModelChanged(uri, {
						changes: [{
							range,
							text,
							rangeOffset: undefined!,
							rangeLength: undefined!,
						}],
						eol: undefined!,
						versionId: documents.getDocumentData(uri)!.version + 1,
						isRedoing: false,
						isUndoing: false,
						detailedReason: undefined,
						isFlush: false,
						isEolChange: false,
					}, true);
					// }
				}

				return Promise.resolve(true);
			}
		});

		const document = documents.getDocument(resource);

		const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
			// the document state we started with
			assert.strictEqual(document.version, 1);
			assert.strictEqual(document.getText(), 'foo');

			e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), 'bar')]));
		});

		const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
			// the document state AFTER the first listener kicked in
			assert.strictEqual(document.version, 2);
			assert.strictEqual(document.getText(), 'barfoo');

			e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), 'bar')]));
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(values => {
			sub1.dispose();
			sub2.dispose();

			// the document state AFTER eventing is done
			assert.strictEqual(document.version, 3);
			assert.strictEqual(document.getText(), 'barbarfoo');
		});

	});

	test('Log failing listener', function () {
		let didLogSomething = false;
		const participant = new ExtHostDocumentSaveParticipant(new class extends NullLogService {
			override error(message: string | Error, ...args: any[]): void {
				didLogSomething = true;
			}
		}, documents, mainThreadBulkEdits);


		const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function (e) {
			throw new Error('boom');
		});

		return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
			sub.dispose();
			assert.strictEqual(didLogSomething, true);
		});
	});
});
