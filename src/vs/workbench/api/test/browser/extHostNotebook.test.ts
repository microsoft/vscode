/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { TestRPCProtocol } from 'vs/workbench/api/test/common/testRPCProtocol';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { NullLogService } from 'vs/platform/log/common/log';
import { mock } from 'vs/base/test/common/mock';
import { IModelAddedData, MainContext, MainThreadCommandsShape, MainThreadNotebookShape, NotebookCellsChangedEventDto, NotebookOutputItemDto } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';
import { ExtHostNotebookDocument } from 'vs/workbench/api/common/extHostNotebookDocument';
import { CellKind, CellUri, NotebookCellsChangeType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { URI } from 'vs/base/common/uri';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import { ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { nullExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { isEqual } from 'vs/base/common/resources';
import { Event } from 'vs/base/common/event';
import { ExtHostNotebookDocuments } from 'vs/workbench/api/common/extHostNotebookDocuments';
import { SerializableObjectWithBuffers } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import { VSBuffer } from 'vs/base/common/buffer';
import { IExtHostTelemetry } from 'vs/workbench/api/common/extHostTelemetry';
import { ExtHostConsumerFileSystem } from 'vs/workbench/api/common/extHostFileSystemConsumer';
import { ExtHostFileSystemInfo } from 'vs/workbench/api/common/extHostFileSystemInfo';

suite('NotebookCell#Document', function () {


	let rpcProtocol: TestRPCProtocol;
	let notebook: ExtHostNotebookDocument;
	let extHostDocumentsAndEditors: ExtHostDocumentsAndEditors;
	let extHostDocuments: ExtHostDocuments;
	let extHostNotebooks: ExtHostNotebookController;
	let extHostNotebookDocuments: ExtHostNotebookDocuments;
	let extHostConsumerFileSystem: ExtHostConsumerFileSystem;

	const notebookUri = URI.parse('test:///notebook.file');
	const disposables = new DisposableStore();

	teardown(function () {
		disposables.clear();
	});

	setup(async function () {
		rpcProtocol = new TestRPCProtocol();
		rpcProtocol.set(MainContext.MainThreadCommands, new class extends mock<MainThreadCommandsShape>() {
			override $registerCommand() { }
		});
		rpcProtocol.set(MainContext.MainThreadNotebook, new class extends mock<MainThreadNotebookShape>() {
			override async $registerNotebookSerializer() { }
			override async $unregisterNotebookSerializer() { }
		});
		extHostDocumentsAndEditors = new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService());
		extHostDocuments = new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors);
		extHostConsumerFileSystem = new ExtHostConsumerFileSystem(rpcProtocol, new ExtHostFileSystemInfo());
		extHostNotebooks = new ExtHostNotebookController(rpcProtocol, new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock<IExtHostTelemetry>() {
			override onExtensionError(): boolean {
				return true;
			}
		}), extHostDocumentsAndEditors, extHostDocuments, extHostConsumerFileSystem);
		extHostNotebookDocuments = new ExtHostNotebookDocuments(extHostNotebooks);

		const reg = extHostNotebooks.registerNotebookSerializer(nullExtensionDescription, 'test', new class extends mock<vscode.NotebookSerializer>() { });
		extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({
			addedDocuments: [{
				uri: notebookUri,
				viewType: 'test',
				versionId: 0,
				cells: [{
					handle: 0,
					uri: CellUri.generate(notebookUri, 0),
					source: ['### Heading'],
					eol: '\n',
					language: 'markdown',
					cellKind: CellKind.Markup,
					outputs: [],
				}, {
					handle: 1,
					uri: CellUri.generate(notebookUri, 1),
					source: ['console.log("aaa")', 'console.log("bbb")'],
					eol: '\n',
					language: 'javascript',
					cellKind: CellKind.Code,
					outputs: [],
				}],
			}],
			addedEditors: [{
				documentUri: notebookUri,
				id: '_notebook_editor_0',
				selections: [{ start: 0, end: 1 }],
				visibleRanges: []
			}]
		}));
		extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ newActiveEditor: '_notebook_editor_0' }));

		notebook = extHostNotebooks.notebookDocuments[0]!;

		disposables.add(reg);
		disposables.add(notebook);
		disposables.add(extHostDocuments);
	});


	test('cell document is vscode.TextDocument', async function () {

		assert.strictEqual(notebook.apiNotebook.cellCount, 2);

		const [c1, c2] = notebook.apiNotebook.getCells();
		const d1 = extHostDocuments.getDocument(c1.document.uri);

		assert.ok(d1);
		assert.strictEqual(d1.languageId, c1.document.languageId);
		assert.strictEqual(d1.version, 1);

		const d2 = extHostDocuments.getDocument(c2.document.uri);
		assert.ok(d2);
		assert.strictEqual(d2.languageId, c2.document.languageId);
		assert.strictEqual(d2.version, 1);
	});

	test('cell document goes when notebook closes', async function () {
		const cellUris: string[] = [];
		for (const cell of notebook.apiNotebook.getCells()) {
			assert.ok(extHostDocuments.getDocument(cell.document.uri));
			cellUris.push(cell.document.uri.toString());
		}

		const removedCellUris: string[] = [];
		const reg = extHostDocuments.onDidRemoveDocument(doc => {
			removedCellUris.push(doc.uri.toString());
		});

		extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ removedDocuments: [notebook.uri] }));
		reg.dispose();

		assert.strictEqual(removedCellUris.length, 2);
		assert.deepStrictEqual(removedCellUris.sort(), cellUris.sort());
	});

	test('cell document is vscode.TextDocument after changing it', async function () {

		const p = new Promise<void>((resolve, reject) => {

			extHostNotebookDocuments.onDidChangeNotebookDocument(e => {
				try {
					assert.strictEqual(e.contentChanges.length, 1);
					assert.strictEqual(e.contentChanges[0].addedCells.length, 2);

					const [first, second] = e.contentChanges[0].addedCells;

					const doc1 = extHostDocuments.getAllDocumentData().find(data => isEqual(data.document.uri, first.document.uri));
					assert.ok(doc1);
					assert.strictEqual(doc1?.document === first.document, true);

					const doc2 = extHostDocuments.getAllDocumentData().find(data => isEqual(data.document.uri, second.document.uri));
					assert.ok(doc2);
					assert.strictEqual(doc2?.document === second.document, true);

					resolve();

				} catch (err) {
					reject(err);
				}
			});

		});

		extHostNotebookDocuments.$acceptModelChanged(notebookUri, new SerializableObjectWithBuffers({
			versionId: notebook.apiNotebook.version + 1,
			rawEvents: [
				{
					kind: NotebookCellsChangeType.ModelChange,
					changes: [[0, 0, [{
						handle: 2,
						uri: CellUri.generate(notebookUri, 2),
						source: ['Hello', 'World', 'Hello World!'],
						eol: '\n',
						language: 'test',
						cellKind: CellKind.Code,
						outputs: [],
					}, {
						handle: 3,
						uri: CellUri.generate(notebookUri, 3),
						source: ['Hallo', 'Welt', 'Hallo Welt!'],
						eol: '\n',
						language: 'test',
						cellKind: CellKind.Code,
						outputs: [],
					}]]]
				}
			]
		}), false);

		await p;

	});

	test('cell document stays open when notebook is still open', async function () {

		const docs: vscode.TextDocument[] = [];
		const addData: IModelAddedData[] = [];
		for (const cell of notebook.apiNotebook.getCells()) {
			const doc = extHostDocuments.getDocument(cell.document.uri);
			assert.ok(doc);
			assert.strictEqual(extHostDocuments.getDocument(cell.document.uri).isClosed, false);
			docs.push(doc);
			addData.push({
				EOL: '\n',
				isDirty: doc.isDirty,
				lines: doc.getText().split('\n'),
				languageId: doc.languageId,
				uri: doc.uri,
				versionId: doc.version
			});
		}

		// this call happens when opening a document on the main side
		extHostDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ addedDocuments: addData });

		// this call happens when closing a document from the main side
		extHostDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ removedDocuments: docs.map(d => d.uri) });

		// notebook is still open -> cell documents stay open
		for (const cell of notebook.apiNotebook.getCells()) {
			assert.ok(extHostDocuments.getDocument(cell.document.uri));
			assert.strictEqual(extHostDocuments.getDocument(cell.document.uri).isClosed, false);
		}

		// close notebook -> docs are closed
		extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ removedDocuments: [notebook.uri] }));
		for (const cell of notebook.apiNotebook.getCells()) {
			assert.throws(() => extHostDocuments.getDocument(cell.document.uri));
		}
		for (const doc of docs) {
			assert.strictEqual(doc.isClosed, true);
		}
	});

	test('cell document goes when cell is removed', async function () {

		assert.strictEqual(notebook.apiNotebook.cellCount, 2);
		const [cell1, cell2] = notebook.apiNotebook.getCells();

		extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
			versionId: 2,
			rawEvents: [
				{
					kind: NotebookCellsChangeType.ModelChange,
					changes: [[0, 1, []]]
				}
			]
		}), false);

		assert.strictEqual(notebook.apiNotebook.cellCount, 1);
		assert.strictEqual(cell1.document.isClosed, true); // ref still alive!
		assert.strictEqual(cell2.document.isClosed, false);

		assert.throws(() => extHostDocuments.getDocument(cell1.document.uri));
	});

	test('cell#index', function () {

		assert.strictEqual(notebook.apiNotebook.cellCount, 2);
		const [first, second] = notebook.apiNotebook.getCells();
		assert.strictEqual(first.index, 0);
		assert.strictEqual(second.index, 1);

		// remove first cell
		extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
			versionId: notebook.apiNotebook.version + 1,
			rawEvents: [{
				kind: NotebookCellsChangeType.ModelChange,
				changes: [[0, 1, []]]
			}]
		}), false);

		assert.strictEqual(notebook.apiNotebook.cellCount, 1);
		assert.strictEqual(second.index, 0);

		extHostNotebookDocuments.$acceptModelChanged(notebookUri, new SerializableObjectWithBuffers({
			versionId: notebook.apiNotebook.version + 1,
			rawEvents: [{
				kind: NotebookCellsChangeType.ModelChange,
				changes: [[0, 0, [{
					handle: 2,
					uri: CellUri.generate(notebookUri, 2),
					source: ['Hello', 'World', 'Hello World!'],
					eol: '\n',
					language: 'test',
					cellKind: CellKind.Code,
					outputs: [],
				}, {
					handle: 3,
					uri: CellUri.generate(notebookUri, 3),
					source: ['Hallo', 'Welt', 'Hallo Welt!'],
					eol: '\n',
					language: 'test',
					cellKind: CellKind.Code,
					outputs: [],
				}]]]
			}]
		}), false);

		assert.strictEqual(notebook.apiNotebook.cellCount, 3);
		assert.strictEqual(second.index, 2);
	});

	test('ERR MISSING extHostDocument for notebook cell: #116711', async function () {

		const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);

		// DON'T call this, make sure the cell-documents have not been created yet
		// assert.strictEqual(notebook.notebookDocument.cellCount, 2);

		extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
			versionId: 100,
			rawEvents: [{
				kind: NotebookCellsChangeType.ModelChange,
				changes: [[0, 2, [{
					handle: 3,
					uri: CellUri.generate(notebookUri, 3),
					source: ['### Heading'],
					eol: '\n',
					language: 'markdown',
					cellKind: CellKind.Markup,
					outputs: [],
				}, {
					handle: 4,
					uri: CellUri.generate(notebookUri, 4),
					source: ['console.log("aaa")', 'console.log("bbb")'],
					eol: '\n',
					language: 'javascript',
					cellKind: CellKind.Code,
					outputs: [],
				}]]]
			}]
		}), false);

		assert.strictEqual(notebook.apiNotebook.cellCount, 2);

		const event = await p;

		assert.strictEqual(event.notebook === notebook.apiNotebook, true);
		assert.strictEqual(event.contentChanges.length, 1);
		assert.strictEqual(event.contentChanges[0].range.end - event.contentChanges[0].range.start, 2);
		assert.strictEqual(event.contentChanges[0].removedCells[0].document.isClosed, true);
		assert.strictEqual(event.contentChanges[0].removedCells[1].document.isClosed, true);
		assert.strictEqual(event.contentChanges[0].addedCells.length, 2);
		assert.strictEqual(event.contentChanges[0].addedCells[0].document.isClosed, false);
		assert.strictEqual(event.contentChanges[0].addedCells[1].document.isClosed, false);
	});


	test('Opening a notebook results in VS Code firing the event onDidChangeActiveNotebookEditor twice #118470', function () {
		let count = 0;
		extHostNotebooks.onDidChangeActiveNotebookEditor(() => count += 1);

		extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({
			addedEditors: [{
				documentUri: notebookUri,
				id: '_notebook_editor_2',
				selections: [{ start: 0, end: 1 }],
				visibleRanges: []
			}]
		}));

		extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({
			newActiveEditor: '_notebook_editor_2'
		}));

		assert.strictEqual(count, 1);
	});

	test('unset active notebook editor', function () {

		const editor = extHostNotebooks.activeNotebookEditor;
		assert.ok(editor !== undefined);

		extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ newActiveEditor: undefined }));
		assert.ok(extHostNotebooks.activeNotebookEditor === editor);

		extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({}));
		assert.ok(extHostNotebooks.activeNotebookEditor === editor);

		extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ newActiveEditor: null }));
		assert.ok(extHostNotebooks.activeNotebookEditor === undefined);
	});

	test('change cell language triggers onDidChange events', async function () {

		const first = notebook.apiNotebook.cellAt(0);

		assert.strictEqual(first.document.languageId, 'markdown');

		const removed = Event.toPromise(extHostDocuments.onDidRemoveDocument);
		const added = Event.toPromise(extHostDocuments.onDidAddDocument);

		extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
			versionId: 12, rawEvents: [{
				kind: NotebookCellsChangeType.ChangeCellLanguage,
				index: 0,
				language: 'fooLang'
			}]
		}), false);

		const removedDoc = await removed;
		const addedDoc = await added;

		assert.strictEqual(first.document.languageId, 'fooLang');
		assert.ok(removedDoc === addedDoc);
	});

	test('onDidChangeNotebook-event, cell changes', async function () {

		const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);

		extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
			versionId: 12, rawEvents: [{
				kind: NotebookCellsChangeType.ChangeCellMetadata,
				index: 0,
				metadata: { foo: 1 }
			}, {
				kind: NotebookCellsChangeType.ChangeCellMetadata,
				index: 1,
				metadata: { foo: 2 },
			}, {
				kind: NotebookCellsChangeType.Output,
				index: 1,
				outputs: [
					{
						items: [{
							valueBytes: VSBuffer.fromByteArray([0, 2, 3]),
							mime: 'text/plain'
						}],
						outputId: '1'
					}
				]
			}]
		}), false, undefined);


		const event = await p;

		assert.strictEqual(event.notebook === notebook.apiNotebook, true);
		assert.strictEqual(event.contentChanges.length, 0);
		assert.strictEqual(event.cellChanges.length, 2);

		const [first, second] = event.cellChanges;
		assert.deepStrictEqual(first.metadata, first.cell.metadata);
		assert.deepStrictEqual(first.executionSummary, undefined);
		assert.deepStrictEqual(first.outputs, undefined);
		assert.deepStrictEqual(first.document, undefined);

		assert.deepStrictEqual(second.outputs, second.cell.outputs);
		assert.deepStrictEqual(second.metadata, second.cell.metadata);
		assert.deepStrictEqual(second.executionSummary, undefined);
		assert.deepStrictEqual(second.document, undefined);
	});

	test('onDidChangeNotebook-event, notebook metadata', async function () {

		const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);

		extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({ versionId: 12, rawEvents: [] }), false, { foo: 2 });

		const event = await p;

		assert.strictEqual(event.notebook === notebook.apiNotebook, true);
		assert.strictEqual(event.contentChanges.length, 0);
		assert.strictEqual(event.cellChanges.length, 0);
		assert.deepStrictEqual(event.metadata, { foo: 2 });
	});

	test('onDidChangeNotebook-event, froozen data', async function () {

		const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);

		extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({ versionId: 12, rawEvents: [] }), false, { foo: 2 });

		const event = await p;

		assert.ok(Object.isFrozen(event));
		assert.ok(Object.isFrozen(event.cellChanges));
		assert.ok(Object.isFrozen(event.contentChanges));
		assert.ok(Object.isFrozen(event.notebook));
		assert.ok(!Object.isFrozen(event.metadata));
	});

	test('change cell language and onDidChangeNotebookDocument', async function () {

		const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);

		const first = notebook.apiNotebook.cellAt(0);
		assert.strictEqual(first.document.languageId, 'markdown');

		extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
			versionId: 12,
			rawEvents: [{
				kind: NotebookCellsChangeType.ChangeCellLanguage,
				index: 0,
				language: 'fooLang'
			}]
		}), false);

		const event = await p;

		assert.strictEqual(event.notebook === notebook.apiNotebook, true);
		assert.strictEqual(event.contentChanges.length, 0);
		assert.strictEqual(event.cellChanges.length, 1);

		const [cellChange] = event.cellChanges;

		assert.strictEqual(cellChange.cell === first, true);
		assert.ok(cellChange.document === first.document);
		assert.ok(cellChange.executionSummary === undefined);
		assert.ok(cellChange.metadata === undefined);
		assert.ok(cellChange.outputs === undefined);
	});

	test('change notebook cell document and onDidChangeNotebookDocument', async function () {

		const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);

		const first = notebook.apiNotebook.cellAt(0);

		extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
			versionId: 12,
			rawEvents: [{
				kind: NotebookCellsChangeType.ChangeCellContent,
				index: 0
			}]
		}), false);

		const event = await p;

		assert.strictEqual(event.notebook === notebook.apiNotebook, true);
		assert.strictEqual(event.contentChanges.length, 0);
		assert.strictEqual(event.cellChanges.length, 1);

		const [cellChange] = event.cellChanges;

		assert.strictEqual(cellChange.cell === first, true);
		assert.ok(cellChange.document === first.document);
		assert.ok(cellChange.executionSummary === undefined);
		assert.ok(cellChange.metadata === undefined);
		assert.ok(cellChange.outputs === undefined);
	});

	async function replaceOutputs(cellIndex: number, outputId: string, outputItems: NotebookOutputItemDto[]) {
		const changeEvent = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
		extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers<NotebookCellsChangedEventDto>({
			versionId: notebook.apiNotebook.version + 1,
			rawEvents: [{
				kind: NotebookCellsChangeType.Output,
				index: cellIndex,
				outputs: [{ outputId, items: outputItems }]
			}]
		}), false);
		await changeEvent;
	}
	async function appendOutputItem(cellIndex: number, outputId: string, outputItems: NotebookOutputItemDto[]) {
		const changeEvent = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
		extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers<NotebookCellsChangedEventDto>({
			versionId: notebook.apiNotebook.version + 1,
			rawEvents: [{
				kind: NotebookCellsChangeType.OutputItem,
				index: cellIndex,
				append: true,
				outputId,
				outputItems
			}]
		}), false);
		await changeEvent;
	}
	test('Append multiple text/plain output items', async function () {
		await replaceOutputs(1, '1', [{ mime: 'text/plain', valueBytes: VSBuffer.fromString('foo') }]);
		await appendOutputItem(1, '1', [{ mime: 'text/plain', valueBytes: VSBuffer.fromString('bar') }]);
		await appendOutputItem(1, '1', [{ mime: 'text/plain', valueBytes: VSBuffer.fromString('baz') }]);


		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 3);
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, 'text/plain');
		assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[0].data).toString(), 'foo');
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[1].mime, 'text/plain');
		assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[1].data).toString(), 'bar');
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[2].mime, 'text/plain');
		assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[2].data).toString(), 'baz');
	});
	test('Append multiple stdout stream output items to an output with another mime', async function () {
		await replaceOutputs(1, '1', [{ mime: 'text/plain', valueBytes: VSBuffer.fromString('foo') }]);
		await appendOutputItem(1, '1', [{ mime: 'application/vnd.code.notebook.stdout', valueBytes: VSBuffer.fromString('bar') }]);
		await appendOutputItem(1, '1', [{ mime: 'application/vnd.code.notebook.stdout', valueBytes: VSBuffer.fromString('baz') }]);

		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 3);
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, 'text/plain');
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[1].mime, 'application/vnd.code.notebook.stdout');
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[2].mime, 'application/vnd.code.notebook.stdout');
	});
	test('Compress multiple stdout stream output items', async function () {
		await replaceOutputs(1, '1', [{ mime: 'application/vnd.code.notebook.stdout', valueBytes: VSBuffer.fromString('foo') }]);
		await appendOutputItem(1, '1', [{ mime: 'application/vnd.code.notebook.stdout', valueBytes: VSBuffer.fromString('bar') }]);
		await appendOutputItem(1, '1', [{ mime: 'application/vnd.code.notebook.stdout', valueBytes: VSBuffer.fromString('baz') }]);

		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 1);
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, 'application/vnd.code.notebook.stdout');
		assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[0].data).toString(), 'foobarbaz');
	});
	test('Compress multiple stdout stream output items (with support for terminal escape code -> \u001b[A)', async function () {
		await replaceOutputs(1, '1', [{ mime: 'application/vnd.code.notebook.stdout', valueBytes: VSBuffer.fromString('\nfoo') }]);
		await appendOutputItem(1, '1', [{ mime: 'application/vnd.code.notebook.stdout', valueBytes: VSBuffer.fromString(`${String.fromCharCode(27)}[Abar`) }]);

		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 1);
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, 'application/vnd.code.notebook.stdout');
		assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[0].data).toString(), 'bar');
	});
	test('Compress multiple stdout stream output items (with support for terminal escape code -> \r character)', async function () {
		await replaceOutputs(1, '1', [{ mime: 'application/vnd.code.notebook.stdout', valueBytes: VSBuffer.fromString('foo') }]);
		await appendOutputItem(1, '1', [{ mime: 'application/vnd.code.notebook.stdout', valueBytes: VSBuffer.fromString(`\rbar`) }]);

		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 1);
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, 'application/vnd.code.notebook.stdout');
		assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[0].data).toString(), 'bar');
	});
	test('Compress multiple stderr stream output items', async function () {
		await replaceOutputs(1, '1', [{ mime: 'application/vnd.code.notebook.stderr', valueBytes: VSBuffer.fromString('foo') }]);
		await appendOutputItem(1, '1', [{ mime: 'application/vnd.code.notebook.stderr', valueBytes: VSBuffer.fromString('bar') }]);
		await appendOutputItem(1, '1', [{ mime: 'application/vnd.code.notebook.stderr', valueBytes: VSBuffer.fromString('baz') }]);

		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 1);
		assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, 'application/vnd.code.notebook.stderr');
		assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[0].data).toString(), 'foobarbaz');
	});
});
