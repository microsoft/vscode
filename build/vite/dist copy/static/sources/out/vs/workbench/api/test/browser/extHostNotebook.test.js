/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { mock } from '../../../../base/test/common/mock.js';
import { MainContext } from '../../common/extHost.protocol.js';
import { ExtHostNotebookController } from '../../common/extHostNotebook.js';
import { CellKind, CellUri, NotebookCellsChangeType } from '../../../contrib/notebook/common/notebookCommon.js';
import { URI } from '../../../../base/common/uri.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Event } from '../../../../base/common/event.js';
import { ExtHostNotebookDocuments } from '../../common/extHostNotebookDocuments.js';
import { SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ExtHostConsumerFileSystem } from '../../common/extHostFileSystemConsumer.js';
import { ExtHostFileSystemInfo } from '../../common/extHostFileSystemInfo.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtHostSearch } from '../../common/extHostSearch.js';
import { URITransformerService } from '../../common/extHostUriTransformerService.js';
suite('NotebookCell#Document', function () {
    let rpcProtocol;
    let notebook;
    let extHostDocumentsAndEditors;
    let extHostDocuments;
    let extHostNotebooks;
    let extHostNotebookDocuments;
    let extHostConsumerFileSystem;
    let extHostSearch;
    const notebookUri = URI.parse('test:///notebook.file');
    const disposables = new DisposableStore();
    teardown(function () {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(async function () {
        rpcProtocol = new TestRPCProtocol();
        rpcProtocol.set(MainContext.MainThreadCommands, new class extends mock() {
            $registerCommand() { }
        });
        rpcProtocol.set(MainContext.MainThreadNotebook, new class extends mock() {
            async $registerNotebookSerializer() { }
            async $unregisterNotebookSerializer() { }
        });
        extHostDocumentsAndEditors = new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService());
        extHostDocuments = new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors);
        extHostConsumerFileSystem = new ExtHostConsumerFileSystem(rpcProtocol, new ExtHostFileSystemInfo());
        extHostSearch = new ExtHostSearch(rpcProtocol, new URITransformerService(null), new NullLogService());
        extHostNotebooks = new ExtHostNotebookController(rpcProtocol, new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock() {
            onExtensionError() {
                return true;
            }
        }), extHostDocumentsAndEditors, extHostDocuments, extHostConsumerFileSystem, extHostSearch, new NullLogService());
        extHostNotebookDocuments = new ExtHostNotebookDocuments(extHostNotebooks);
        const reg = extHostNotebooks.registerNotebookSerializer(nullExtensionDescription, 'test', new class extends mock() {
        });
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
                    visibleRanges: [],
                    viewType: 'test'
                }]
        }));
        extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ newActiveEditor: '_notebook_editor_0' }));
        notebook = extHostNotebooks.notebookDocuments[0];
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
        const cellUris = [];
        for (const cell of notebook.apiNotebook.getCells()) {
            assert.ok(extHostDocuments.getDocument(cell.document.uri));
            cellUris.push(cell.document.uri.toString());
        }
        const removedCellUris = [];
        const reg = extHostDocuments.onDidRemoveDocument(doc => {
            removedCellUris.push(doc.uri.toString());
        });
        extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ removedDocuments: [notebook.uri] }));
        reg.dispose();
        assert.strictEqual(removedCellUris.length, 2);
        assert.deepStrictEqual(removedCellUris.sort(), cellUris.sort());
    });
    test('cell document is vscode.TextDocument after changing it', async function () {
        const p = new Promise((resolve, reject) => {
            disposables.add(extHostNotebookDocuments.onDidChangeNotebookDocument(e => {
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
                }
                catch (err) {
                    reject(err);
                }
            }));
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
        const docs = [];
        const addData = [];
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
                versionId: doc.version,
                encoding: 'utf8'
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
        disposables.add(extHostNotebooks.onDidChangeActiveNotebookEditor(() => count += 1));
        extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({
            addedEditors: [{
                    documentUri: notebookUri,
                    id: '_notebook_editor_2',
                    selections: [{ start: 0, end: 1 }],
                    visibleRanges: [],
                    viewType: 'test'
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
    async function replaceOutputs(cellIndex, outputId, outputItems) {
        const changeEvent = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
        extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
            versionId: notebook.apiNotebook.version + 1,
            rawEvents: [{
                    kind: NotebookCellsChangeType.Output,
                    index: cellIndex,
                    outputs: [{ outputId, items: outputItems }]
                }]
        }), false);
        await changeEvent;
    }
    async function appendOutputItem(cellIndex, outputId, outputItems) {
        const changeEvent = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
        extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdE5vdGVib29rLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL3Rlc3QvYnJvd3Nlci9leHRIb3N0Tm90ZWJvb2sudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFFNUIsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQy9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzVELE9BQU8sRUFBbUIsV0FBVyxFQUF5RyxNQUFNLGtDQUFrQyxDQUFDO0FBQ3ZMLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTVFLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDaEgsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxN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RUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5RSxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQzFGLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzdHLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDMUYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0csTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxZQUFZLENBQUMsQ0FBQztRQUMxRixNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM5RyxDQUFDLENBQUMsQ0FBQztJQUNILElBQUksQ0FBQywyRUFBMkUsRUFBRSxLQUFLO1FBQ3RGLE1BQU0sY0FBYyxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsVUFBVSxFQUFFLFFBQVEsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0YsTUFBTSxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsc0NBQXNDLEVBQUUsVUFBVSxFQUFFLFFBQVEsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0gsTUFBTSxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsc0NBQXNDLEVBQUUsVUFBVSxFQUFFLFFBQVEsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFM0gsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENB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LFFBQVEsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFM0gsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JFLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxzQ0FBc0MsQ0FBQyxDQUFDO1FBQ3BILE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ3BILENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==