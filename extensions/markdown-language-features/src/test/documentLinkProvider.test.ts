/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import LinkProvider from '../features/documentLinkProvider';
import { InMemoryDocument } from './inMemoryDocument';


const testFileName = vscode.Uri.parse('test.md');

const noopToken = new class implements vscode.CancellationToken {
	private _onCancellationRequestedEmitter = new vscode.EventEmitter<void>();
	public onCancellationRequested = this._onCancellationRequestedEmitter.event;

	get isCancellationRequested() { return false; }
};

function getLinksForFile(fileContents: string) {
	const doc = new InMemoryDocument(testFileName, fileContents);
	const provider = new LinkProvider();
	return provider.provideDocumentLinks(doc, noopToken);
}


suite('markdown.DocumentLinkProvider', () => {
	test('Should not return anything for empty document', async () => {
		const links = getLinksForFile('');
		assert.strictEqual(links.length, 0);
	});

	test('Should not return anything for simple document without links', async () => {
		const links = getLinksForFile('# a\nfdasfdfsafsa');
		assert.strictEqual(links.length, 0);
	});

	test('Should should detect basic http link', async () => {
		const links = getLinksForFile('a [b](https://example.com) c');
		assert.strictEqual(links.length, 1);
	});
});


