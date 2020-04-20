/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TestRPCProtocol } from 'vs/workbench/test/browser/api/testRPCProtocol';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { NullLogService } from 'vs/platform/log/common/log';
import { ExtHostNotebookConcatDocument } from 'vs/workbench/api/common/extHostNotebookConcatDocument';
import { ExtHostNotebookDocument, ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';
import { URI } from 'vs/base/common/uri';
import { CellKind, CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { Position, Location } from 'vs/workbench/api/common/extHostTypes';
import { ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { nullExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { NotebookProvider } from 'vscode';
import { mock } from 'vs/workbench/test/common/workbenchTestServices';
import { MainContext, MainThreadCommandsShape, MainThreadNotebookShape } from 'vs/workbench/api/common/extHost.protocol';
import { DisposableStore } from 'vs/base/common/lifecycle';


suite('NotebookConcatDocument', function () {

	let rpcProtocol: TestRPCProtocol;
	let notebook: ExtHostNotebookDocument;
	let extHostDocuments: ExtHostDocuments;
	let extHostNotebooks: ExtHostNotebookController;
	const notebookUri = URI.parse('test:///notebook.file');
	const disposables = new DisposableStore();

	setup(async function () {
		disposables.clear();

		rpcProtocol = new TestRPCProtocol();
		rpcProtocol.set(MainContext.MainThreadCommands, new class extends mock<MainThreadCommandsShape>() {
			$registerCommand() { }
		});
		rpcProtocol.set(MainContext.MainThreadNotebook, new class extends mock<MainThreadNotebookShape>() {
			async $registerNotebookProvider() { }
			async $unregisterNotebookProvider() { }
			async $createNotebookDocument() { }
		});
		const extHostDocumentsAndEditors = new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService());
		extHostDocuments = new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors);
		extHostNotebooks = new ExtHostNotebookController(rpcProtocol, new ExtHostCommands(rpcProtocol, new NullLogService()), extHostDocumentsAndEditors);
		let reg = extHostNotebooks.registerNotebookProvider(nullExtensionDescription, 'test', new class extends mock<NotebookProvider>() {
			async resolveNotebook() { }
		});
		await extHostNotebooks.$resolveNotebook('test', notebookUri);
		await extHostNotebooks.$updateActiveEditor('test', notebookUri);

		notebook = extHostNotebooks.activeNotebookDocument!;

		disposables.add(reg);
		disposables.add(notebook);
		disposables.add(extHostDocuments);
	});

	test('empty', function () {
		let doc = new ExtHostNotebookConcatDocument(notebook, extHostNotebooks, extHostDocuments);
		assert.equal(doc.getText(), '');
		assert.equal(doc.versionId, 0);

		// assert.equal(doc.locationAt(new Position(0, 0)), undefined);
		// assert.equal(doc.positionAt(SOME_FAKE_LOCATION?), undefined);
	});

	function assertLocation(doc: ExtHostNotebookConcatDocument, pos: Position, expected: Location, identCheck = true) {
		const actual = doc.locationAt(pos);
		assert.equal(actual.uri.toString(), expected.uri.toString());
		assert.equal(actual.range.isEqual(expected.range), true);

		if (identCheck) {
			// reverse
			const actualPosition = doc.positionAt(actual);
			assert.equal(actualPosition.isEqual(pos), true);
		}
	}

	test('location, position mapping', function () {

		extHostNotebooks.$acceptModelChanged(notebookUri, {
			versionId: notebook.versionId + 1,
			changes: [[0, 0, [{
				handle: 1,
				uri: CellUri.generate(notebook.uri, 1),
				source: ['Hello', 'World', 'Hello World!'],
				language: 'test',
				cellKind: CellKind.Code,
				outputs: [],
			}, {
				handle: 2,
				uri: CellUri.generate(notebook.uri, 2),
				source: ['Hallo', 'Welt', 'Hallo Welt!'],
				language: 'test',
				cellKind: CellKind.Code,
				outputs: [],
			}]]]
		});


		assert.equal(notebook.cells.length, 2);

		let doc = new ExtHostNotebookConcatDocument(notebook, extHostNotebooks, extHostDocuments);
		assert.equal(doc.getText(), ['Hello', 'World', 'Hello World!', 'Hallo', 'Welt', 'Hallo Welt!'].join('\n'));

		assertLocation(doc, new Position(0, 0), new Location(notebook.cells[0].uri, new Position(0, 0)));
		assertLocation(doc, new Position(4, 0), new Location(notebook.cells[1].uri, new Position(1, 0)));
		assertLocation(doc, new Position(4, 3), new Location(notebook.cells[1].uri, new Position(1, 3)));
		assertLocation(doc, new Position(5, 11), new Location(notebook.cells[1].uri, new Position(2, 11)));
		assertLocation(doc, new Position(5, 12), new Location(notebook.cells[1].uri, new Position(2, 11)), false); // don't check identity because position will be clamped
	});


	test('location, position mapping, changes', function () {

		let doc = new ExtHostNotebookConcatDocument(notebook, extHostNotebooks, extHostDocuments);

		// UPDATE 1
		extHostNotebooks.$acceptModelChanged(notebookUri, {
			versionId: notebook.versionId + 1,
			changes: [[0, 0, [{
				handle: 1,
				uri: CellUri.generate(notebook.uri, 1),
				source: ['Hello', 'World', 'Hello World!'],
				language: 'test',
				cellKind: CellKind.Code,
				outputs: [],
			}]]]
		});
		assert.equal(notebook.cells.length, 1);
		assert.equal(doc.versionId, 1);
		assert.equal(doc.getText(), ['Hello', 'World', 'Hello World!'].join('\n'));
		assertLocation(doc, new Position(0, 0), new Location(notebook.cells[0].uri, new Position(0, 0)));
		assertLocation(doc, new Position(2, 2), new Location(notebook.cells[0].uri, new Position(2, 2)));
		assertLocation(doc, new Position(4, 0), new Location(notebook.cells[0].uri, new Position(2, 12)), false); // clamped


		// UPDATE 2
		extHostNotebooks.$acceptModelChanged(notebookUri, {
			versionId: notebook.versionId + 1,
			changes: [[1, 0, [{
				handle: 2,
				uri: CellUri.generate(notebook.uri, 2),
				source: ['Hallo', 'Welt', 'Hallo Welt!'],
				language: 'test',
				cellKind: CellKind.Code,
				outputs: [],
			}]]]
		});

		assert.equal(notebook.cells.length, 2);
		assert.equal(doc.versionId, 2);
		assert.equal(doc.getText(), ['Hello', 'World', 'Hello World!', 'Hallo', 'Welt', 'Hallo Welt!'].join('\n'));
		assertLocation(doc, new Position(0, 0), new Location(notebook.cells[0].uri, new Position(0, 0)));
		assertLocation(doc, new Position(4, 0), new Location(notebook.cells[1].uri, new Position(1, 0)));
		assertLocation(doc, new Position(4, 3), new Location(notebook.cells[1].uri, new Position(1, 3)));
		assertLocation(doc, new Position(5, 11), new Location(notebook.cells[1].uri, new Position(2, 11)));
		assertLocation(doc, new Position(5, 12), new Location(notebook.cells[1].uri, new Position(2, 11)), false); // don't check identity because position will be clamped

		// UPDATE 3 (remove cell #2 again)
		extHostNotebooks.$acceptModelChanged(notebookUri, {
			versionId: notebook.versionId + 1,
			changes: [[1, 1, []]]
		});
		assert.equal(notebook.cells.length, 1);
		assert.equal(doc.versionId, 3);
		assert.equal(doc.getText(), ['Hello', 'World', 'Hello World!'].join('\n'));
		assertLocation(doc, new Position(0, 0), new Location(notebook.cells[0].uri, new Position(0, 0)));
		assertLocation(doc, new Position(2, 2), new Location(notebook.cells[0].uri, new Position(2, 2)));
		assertLocation(doc, new Position(4, 0), new Location(notebook.cells[0].uri, new Position(2, 12)), false); // clamped

	});
});
