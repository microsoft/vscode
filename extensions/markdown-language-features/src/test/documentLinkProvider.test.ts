/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import LinkProvider from '../features/documentLinkProvider';
import { InMemoryDocument } from './inMemoryDocument';


const testFileName = vscode.Uri.file('test.md');

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

function assertRangeEqual(expected: vscode.Range, actual: vscode.Range) {
	assert.strictEqual(expected.start.line, actual.start.line);
	assert.strictEqual(expected.start.character, actual.start.character);
	assert.strictEqual(expected.end.line, actual.end.line);
	assert.strictEqual(expected.end.character, actual.end.character);
}

suite('markdown.DocumentLinkProvider', () => {
	test('Should not return anything for empty document', () => {
		const links = getLinksForFile('');
		assert.strictEqual(links.length, 0);
	});

	test('Should not return anything for simple document without links', () => {
		const links = getLinksForFile('# a\nfdasfdfsafsa');
		assert.strictEqual(links.length, 0);
	});

	test('Should detect basic http links', () => {
		const links = getLinksForFile('a [b](https://example.com) c');
		assert.strictEqual(links.length, 1);
		const [link] = links;
		assertRangeEqual(link.range, new vscode.Range(0, 6, 0, 25));
	});

	test('Should detect basic workspace links', () => {
		{
			const links = getLinksForFile('a [b](./file) c');
			assert.strictEqual(links.length, 1);
			const [link] = links;
			assertRangeEqual(link.range, new vscode.Range(0, 6, 0, 12));
		}
		{
			const links = getLinksForFile('a [b](file.png) c');
			assert.strictEqual(links.length, 1);
			const [link] = links;
			assertRangeEqual(link.range, new vscode.Range(0, 6, 0, 14));
		}
	});

	test('Should detect links with title', () => {
		const links = getLinksForFile('a [b](https://example.com "abc") c');
		assert.strictEqual(links.length, 1);
		const [link] = links;
		assertRangeEqual(link.range, new vscode.Range(0, 6, 0, 25));
	});


	test('Should handle links with balanced parens', () => {
		{
			const links = getLinksForFile('a [b](https://example.com/a()c) c');
			assert.strictEqual(links.length, 1);
			const [link] = links;
			assertRangeEqual(link.range, new vscode.Range(0, 6, 0, 30));
		}
		{
			const links = getLinksForFile('a [b](https://example.com/a(b)c) c');
			assert.strictEqual(links.length, 1);
			const [link] = links;
			assertRangeEqual(link.range, new vscode.Range(0, 6, 0, 31));

		}
		{
			// #49011
			const links = getLinksForFile('[A link](http://ThisUrlhasParens/A_link(in_parens))');
			assert.strictEqual(links.length, 1);
			const [link] = links;
			assertRangeEqual(link.range, new vscode.Range(0, 9, 0, 50));
		}
	});

	test('Should handle two links without space', () => {
		const links = getLinksForFile('a ([test](test)[test2](test2)) c');
		assert.strictEqual(links.length, 2);
		const [link1, link2] = links;
		assertRangeEqual(link1.range, new vscode.Range(0, 10, 0, 14));
		assertRangeEqual(link2.range, new vscode.Range(0, 23, 0, 28));
	});
});


