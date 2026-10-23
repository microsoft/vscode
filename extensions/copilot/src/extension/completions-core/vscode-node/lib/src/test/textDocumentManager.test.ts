/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IInstantiationService, ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { makeFsUri } from '../util/uri';
import { createLibTestingContext } from './context';
import { SimpleTestTextDocumentManager, createTextDocument } from './textDocument';

suite('TextDocumentManager base class', () => {
	let textDocumentManager: SimpleTestTextDocumentManager;
	let accessor: ServicesAccessor;

	setup(function () {
		accessor = createLibTestingContext().createTestingAccessor();
		textDocumentManager = accessor.get(IInstantiationService).createInstance(SimpleTestTextDocumentManager);
	});

	test('should return the relative path of the document without workspaces', () => {
		const mockDocument = createTextDocument(makeFsUri('/path/to/file.txt'), '', 0, '');

		const relativePath = textDocumentManager.getRelativePath(mockDocument);

		assert.strictEqual(relativePath, 'file.txt');
	});

	test('should return the relative path of the document in workspace', () => {
		textDocumentManager.init([{ uri: 'file:///path/to/workspace' }]);
		const mockDocument = createTextDocument(makeFsUri('/path/to/workspace/folder/file.txt'), '', 0, '');

		const relativePath = textDocumentManager.getRelativePath(mockDocument);

		assert.strictEqual(relativePath, 'folder/file.txt');
	});

	test('should return the relative path of the document in workspace with trailing slash', () => {
		textDocumentManager.init([{ uri: 'file:///path/to/workspace/' }]);
		const mockDocument = createTextDocument(makeFsUri('/path/to/workspace/folder/file.txt'), '', 0, '');

		const relativePath = textDocumentManager.getRelativePath(mockDocument);

		assert.strictEqual(relativePath, 'folder/file.txt');
	});

	test('should return undefined for untitled documents', () => {
		const mockDocument = createTextDocument('untitled:Untitled-1', '', 0, '');

		const relativePath = textDocumentManager.getRelativePath(mockDocument);

		assert.strictEqual(relativePath, undefined);
	});

	test('.getTextDocumentUnsafe() returns an existing document', function () {
		textDocumentManager.setTextDocument('file:///path/to/file.txt', 'plaintext', 'file content');

		const result = textDocumentManager.getTextDocumentUnsafe({ uri: 'file:///path/to/file.txt' });

		assert.ok(result);
		assert.strictEqual(result?.getText(), 'file content');
	});

	test('.getTextDocumentUnsafe() returns undefined for an unopened document', function () {
		const result = textDocumentManager.getTextDocumentUnsafe({ uri: 'file:///path/to/file.txt' });

		assert.strictEqual(result, undefined);
	});

	test('.getTextDocumentUnsafe() normalizes URIs', function () {
		textDocumentManager.setTextDocument('file:///c%3A/file', 'plaintext', 'file content');

		const result = textDocumentManager.getTextDocumentUnsafe({ uri: 'file:///C:/file' });

		assert.ok(result);
		assert.strictEqual(result?.getText(), 'file content');
	});

	test('.getTextDocument() finds documents by normalized URI', async function () {
		const saved = textDocumentManager.setTextDocument('file:///c%3A/file', 'plaintext', 'file content');

		const retrieved = await textDocumentManager.getTextDocument({ uri: 'file:///C:/file' });

		assert.strictEqual(retrieved, saved);
	});

	test('.getTextDocument() returns undefined for anything other than an open document', async function () {
		const result = await textDocumentManager.getTextDocument({ uri: 'file:///path/to/file.txt' });

		assert.strictEqual(result, undefined);
	});

	test('.getTextDocument() retrieves the document synchronously', async function () {
		textDocumentManager.setTextDocument('file:///path/to/file.txt', 'plaintext', 'file content');

		const thenable = textDocumentManager.getTextDocument({ uri: 'file:///path/to/file.txt' });
		textDocumentManager.updateTextDocument('file:///path/to/file.txt', 'new content');
		const document = await thenable;

		assert.strictEqual(document?.version, 0);
		assert.strictEqual(document?.getText(), 'file content');
	});
});
