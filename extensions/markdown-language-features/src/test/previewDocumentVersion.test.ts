/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { PreviewDocumentVersion } from '../preview/preview';

function makeDocument(uri: vscode.Uri, version: number): vscode.TextDocument {
	return { uri, version } as vscode.TextDocument;
}

suite('PreviewDocumentVersion', () => {
	const uri = vscode.Uri.file('/doc.md');

	test('Versions taken from the same document should be equal', () => {
		const doc = makeDocument(uri, 1);
		assert.ok(new PreviewDocumentVersion(doc).equals(new PreviewDocumentVersion(doc)));
	});

	test('Versions taken from the same document at different versions should not be equal', () => {
		const doc = makeDocument(uri, 1);
		const before = new PreviewDocumentVersion(doc);
		(doc as { version: number }).version = 2;
		assert.ok(!before.equals(new PreviewDocumentVersion(doc)));
	});

	test('Versions taken from different documents should not be equal, even when the uri and version match', () => {
		// A closed document that is re-opened produces a new document object whose version
		// numbering restarts, so identical (uri, version) pairs from different document
		// objects must not be treated as the same content.
		assert.ok(!new PreviewDocumentVersion(makeDocument(uri, 1)).equals(new PreviewDocumentVersion(makeDocument(uri, 1))));
	});
});
