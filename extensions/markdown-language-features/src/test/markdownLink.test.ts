/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as assert from 'assert';
import 'mocha';
import { SkinnyTextDocument, checkSmartPaste, createEditAddingLinksForUriList, appendToLinkSnippet } from '../languageFeatures/copyFiles/shared';
import { validateLink } from '../languageFeatures/copyFiles/copyPasteLinks';

export class InMemoryDocument implements SkinnyTextDocument {

	public readonly uri: vscode.Uri;

	constructor(
		uri: vscode.Uri,
		range: vscode.Range,
		docText: string
	) {
		this.uri = uri;
		this.getText(range, docText);
	}

	offsetAt(position: vscode.Position): number {
		return this.offsetAt(position);
	}

	getText(range: vscode.Range, docText?: string): string {
		return docText || this.getText(range);
	}
}

suite('createEditAddingLinksForUriList', () => {

	test('Markdown Link Pasting should occur for a valid link (end to end)', async () => {
		// createEditAddingLinksForUriList -> checkSmartPaste -> tryGetUriListSnippet -> createUriListSnippet -> createLinkSnippet
		const skinnyDocument = new InMemoryDocument(vscode.Uri.parse('file:///path/to/your/file'), new vscode.Range(0, 0, 0, 12), 'hello world!');

		const result = await createEditAddingLinksForUriList(skinnyDocument, [new vscode.Range(0, 0, 0, 12)], 'https://www.microsoft.com/', true, true, new vscode.CancellationTokenSource().token);
		// need to check the actual result -> snippet value
		assert.strictEqual(result?.label, 'Insert Markdown Link');
	});

	suite('validateLink', () => {

		test('Markdown pasting should occur for a valid link.', () => {
			const isLink = validateLink('https://www.microsoft.com/').isValid;
			assert.strictEqual(isLink, true);
		});

		test('Markdown pasting should occur for a valid link preceded by a new line.', () => {
			const isLink = validateLink('\r\nhttps://www.microsoft.com/').isValid;
			assert.strictEqual(isLink, true);
		});

		test('Markdown pasting should occur for a valid link followed by a new line.', () => {
			const isLink = validateLink('https://www.microsoft.com/\r\n').isValid;
			assert.strictEqual(isLink, true);
		});

		test('Markdown pasting should not occur for a valid hostname and invalid protool.', () => {
			const isLink = validateLink('invalid:www.microsoft.com').isValid;
			assert.strictEqual(isLink, false);
		});

		test('Markdown pasting should not occur for plain text.', () => {
			const isLink = validateLink('hello world!').isValid;
			assert.strictEqual(isLink, false);
		});

		test('Markdown pasting should not occur for plain text including a colon.', () => {
			const isLink = validateLink('hello: world!').isValid;
			assert.strictEqual(isLink, false);
		});

		test('Markdown pasting should not occur for plain text including a slashes.', () => {
			const isLink = validateLink('helloworld!').isValid;
			assert.strictEqual(isLink, false);
		});

		test('Markdown pasting should not occur for a link followed by text.', () => {
			const isLink = validateLink('https://www.microsoft.com/ hello world!').isValid;
			assert.strictEqual(isLink, false);
		});

		test('Markdown pasting should occur for a link preceded or followed by spaces.', () => {
			const isLink = validateLink('     https://www.microsoft.com/     ').isValid;
			assert.strictEqual(isLink, true);
		});

		test('Markdown pasting should not occur for a link with an invalid scheme.', () => {
			const isLink = validateLink('hello:www.microsoft.com').isValid;
			assert.strictEqual(isLink, false);
		});

		test('Markdown pasting should not occur for multiple links being pasted.', () => {
			const isLink = validateLink('https://www.microsoft.com/\r\nhttps://www.microsoft.com/\r\nhttps://www.microsoft.com/\r\nhttps://www.microsoft.com/').isValid;
			assert.strictEqual(isLink, false);
		});

		test('Markdown pasting should not occur for multiple links with spaces being pasted.', () => {
			const isLink = validateLink('https://www.microsoft.com/    \r\nhttps://www.microsoft.com/\r\nhttps://www.microsoft.com/\r\n hello \r\nhttps://www.microsoft.com/').isValid;
			assert.strictEqual(isLink, false);
		});
	});

	suite('appendToLinkSnippet', () => {
		test('Should not create Markdown link snippet when pasteAsMarkdownLink is false', () => {
			const uri = 'https://www.microsoft.com/';
			const snippet = appendToLinkSnippet(new vscode.SnippetString(''), false, 'https://www.microsoft.com', '', uri, 0, true);
			assert.strictEqual(snippet?.value, 'https://www.microsoft.com/');
		});

		test('Should create Markdown link snippet when pasteAsMarkdownLink is true', () => {
			const uri = 'https://www.microsoft.com/';
			const snippet = appendToLinkSnippet(new vscode.SnippetString(''), true, 'https://www.microsoft.com', '', uri, 0, true);
			assert.strictEqual(snippet?.value, '[${0:Title}](https://www.microsoft.com/)');
		});

		test('Should use an unencoded URI string in Markdown link when passing in an external browser link', () => {
			const uri = 'https://www.microsoft.com/';
			const snippet = appendToLinkSnippet(new vscode.SnippetString(''), true, 'https://www.microsoft.com', '', uri, 0, true);
			assert.strictEqual(snippet?.value, '[${0:Title}](https://www.microsoft.com/)');
		});
	});

	suite('checkSmartPaste', () => {

		const null_range = new vscode.Range(0, 0, 0, 12);

		test('Should evaluate pasteAsMarkdownLink as true for selected plain text', () => {
			const skinnyDocument = new InMemoryDocument(vscode.Uri.parse('file:///path/to/your/file'), null_range, 'hello world!');
			const range = new vscode.Range(0, 5, 0, 5);
			const smartPaste = checkSmartPaste(skinnyDocument, range);
			assert.strictEqual(smartPaste.pasteAsMarkdownLink, true);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a code block', () => {
			const skinnyDocument = new InMemoryDocument(vscode.Uri.parse('file:///path/to/your/file'), null_range, '```\r\n\r\n```');
			const range = new vscode.Range(0, 5, 0, 5);
			const smartPaste = checkSmartPaste(skinnyDocument, range);
			assert.strictEqual(smartPaste.pasteAsMarkdownLink, false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a math block', () => {
			const skinnyDocument = new InMemoryDocument(vscode.Uri.parse('file:///path/to/your/file'), null_range, '$$$\r\n\r\n$$$');
			const range = new vscode.Range(0, 5, 0, 5);
			const smartPaste = checkSmartPaste(skinnyDocument, range);
			assert.strictEqual(smartPaste.pasteAsMarkdownLink, false);
		});

		test('Should evaluate updateTitle as true for pasting over a Markdown link', () => {
			const skinnyDocument = new InMemoryDocument(vscode.Uri.parse('file:///path/to/your/file'), new vscode.Range(0, 0, 0, 12), '[a](bcdef)');
			const range = new vscode.Range(0, 0, 0, 10);
			const smartPaste = checkSmartPaste(skinnyDocument, range);
			assert.strictEqual(smartPaste.updateTitle, true);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a Markdown link', () => {
			const skinnyDocument = new InMemoryDocument(vscode.Uri.parse('file:///path/to/your/file'), new vscode.Range(0, 0, 0, 12), '[a](bcdef)');
			const range = new vscode.Range(0, 4, 0, 6);
			const smartPaste = checkSmartPaste(skinnyDocument, range);
			assert.strictEqual(smartPaste.pasteAsMarkdownLink, false);
		});

		test('Should evaluate updateTitle as true for pasting over a Markdown image link', () => {
			const skinnyDocument = new InMemoryDocument(vscode.Uri.parse('file:///path/to/your/file'), new vscode.Range(0, 0, 0, 12), '![a](bcdef)');
			const range = new vscode.Range(0, 0, 0, 11);
			const smartPaste = checkSmartPaste(skinnyDocument, range);
			assert.strictEqual(smartPaste.updateTitle, true);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a Markdown image link', () => {
			const skinnyDocument = new InMemoryDocument(vscode.Uri.parse('file:///path/to/your/file'), new vscode.Range(0, 0, 0, 12), '![a](bcdef)');
			const range = new vscode.Range(0, 5, 0, 10);
			const smartPaste = checkSmartPaste(skinnyDocument, range);
			assert.strictEqual(smartPaste.pasteAsMarkdownLink, false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within inline code', () => {
			const skinnyDocument = new InMemoryDocument(vscode.Uri.parse('file:///path/to/your/file'), new vscode.Range(0, 0, 0, 12), '``');
			const range = new vscode.Range(0, 1, 0, 1);
			const smartPaste = checkSmartPaste(skinnyDocument, range);
			assert.strictEqual(smartPaste.pasteAsMarkdownLink, false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within inline math', () => {
			const skinnyDocument = new InMemoryDocument(vscode.Uri.parse('file:///path/to/your/file'), new vscode.Range(0, 0, 0, 12), '$$');
			const range = new vscode.Range(0, 1, 0, 1);
			const smartPaste = checkSmartPaste(skinnyDocument, range);
			assert.strictEqual(smartPaste.pasteAsMarkdownLink, false);
		});
	});
});
