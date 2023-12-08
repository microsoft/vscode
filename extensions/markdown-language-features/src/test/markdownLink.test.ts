/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { InMemoryDocument } from '../client/inMemoryDocument';
import { appendToLinkSnippet, createEditAddingLinksForUriList, findValidUriInText, shouldSmartPaste } from '../languageFeatures/copyFiles/shared';

suite('createEditAddingLinksForUriList', () => {

	test('Markdown Link Pasting should occur for a valid link (end to end)', async () => {
		// createEditAddingLinksForUriList -> checkSmartPaste -> tryGetUriListSnippet -> createUriListSnippet -> createLinkSnippet

		const result = createEditAddingLinksForUriList(
			new InMemoryDocument(vscode.Uri.file('test.md'), 'hello world!'), [new vscode.Range(0, 0, 0, 12)], 'https://www.microsoft.com/', true, true);
		// need to check the actual result -> snippet value
		assert.strictEqual(result?.label, 'Insert Markdown Link');
	});

	suite('validateLink', () => {

		test('Markdown pasting should occur for a valid link', () => {
			assert.strictEqual(
				findValidUriInText('https://www.microsoft.com/'),
				'https://www.microsoft.com/');
		});

		test('Markdown pasting should occur for a valid link preceded by a new line', () => {
			assert.strictEqual(
				findValidUriInText('\r\nhttps://www.microsoft.com/'),
				'https://www.microsoft.com/');
		});

		test('Markdown pasting should occur for a valid link followed by a new line', () => {
			assert.strictEqual(
				findValidUriInText('https://www.microsoft.com/\r\n'),
				'https://www.microsoft.com/');
		});

		test('Markdown pasting should not occur for a valid hostname and invalid protool', () => {
			assert.strictEqual(
				findValidUriInText('invalid:www.microsoft.com'),
				undefined);
		});

		test('Markdown pasting should not occur for plain text', () => {
			assert.strictEqual(
				findValidUriInText('hello world!'),
				undefined);
		});

		test('Markdown pasting should not occur for plain text including a colon', () => {
			assert.strictEqual(
				findValidUriInText('hello: world!'),
				undefined);
		});

		test('Markdown pasting should not occur for plain text including a slashes', () => {
			assert.strictEqual(
				findValidUriInText('helloworld!'),
				undefined);
		});

		test('Markdown pasting should not occur for a link followed by text', () => {
			assert.strictEqual(
				findValidUriInText('https://www.microsoft.com/ hello world!'),
				undefined);
		});

		test('Markdown pasting should occur for a link preceded or followed by spaces', () => {
			assert.strictEqual(
				findValidUriInText('     https://www.microsoft.com/     '),
				'https://www.microsoft.com/');
		});

		test('Markdown pasting should not occur for a link with an invalid scheme', () => {
			assert.strictEqual(
				findValidUriInText('hello:www.microsoft.com'),
				undefined);
		});

		test('Markdown pasting should not occur for multiple links being pasted', () => {
			assert.strictEqual(
				findValidUriInText('https://www.microsoft.com/\r\nhttps://www.microsoft.com/\r\nhttps://www.microsoft.com/\r\nhttps://www.microsoft.com/'),
				undefined);
		});

		test('Markdown pasting should not occur for multiple links with spaces being pasted', () => {
			assert.strictEqual(
				findValidUriInText('https://www.microsoft.com/    \r\nhttps://www.microsoft.com/\r\nhttps://www.microsoft.com/\r\n hello \r\nhttps://www.microsoft.com/'),
				undefined);
		});

		test('Markdown pasting should not occur for just a valid uri scheme', () => {
			assert.strictEqual(
				findValidUriInText('https://'),
				undefined);
		});
	});

	suite('appendToLinkSnippet', () => {

		test('Should create snippet with < > when pasted link has an mismatched parentheses', () => {
			const uriString = 'https://www.mic(rosoft.com';
			const snippet = new vscode.SnippetString('');
			appendToLinkSnippet(snippet, 'abc', uriString, 0, true);
			assert.strictEqual(snippet?.value, '[${0:abc}](<https://www.mic(rosoft.com>)');
		});

		test('Should create Markdown link snippet when pasteAsMarkdownLink is true', () => {
			const uriString = 'https://www.microsoft.com';
			const snippet = new vscode.SnippetString('');
			appendToLinkSnippet(snippet, '', uriString, 0, true);
			assert.strictEqual(snippet?.value, '[${0:Title}](https://www.microsoft.com)');
		});

		test('Should use an unencoded URI string in Markdown link when passing in an external browser link', () => {
			const uriString = 'https://www.microsoft.com';
			const snippet = new vscode.SnippetString('');
			appendToLinkSnippet(snippet, '', uriString, 0, true);
			assert.strictEqual(snippet?.value, '[${0:Title}](https://www.microsoft.com)');
		});

		test('Should not decode an encoded URI string when passing in an external browser link', () => {
			const uriString = 'https://www.microsoft.com/%20';
			const snippet = new vscode.SnippetString('');
			appendToLinkSnippet(snippet, '', uriString, 0, true);
			assert.strictEqual(snippet?.value, '[${0:Title}](https://www.microsoft.com/%20)');
		});

		test('Should not encode an unencoded URI string when passing in an external browser link', () => {
			const uriString = 'https://www.example.com/path?query=value&another=value#fragment';
			const snippet = new vscode.SnippetString('');
			appendToLinkSnippet(snippet, '', uriString, 0, true);
			assert.strictEqual(snippet?.value, '[${0:Title}](https://www.example.com/path?query=value&another=value#fragment)');
		});
	});


	suite('checkSmartPaste', () => {

		test('Should evaluate pasteAsMarkdownLink as true for selected plain text', () => {
			assert.strictEqual(
				shouldSmartPaste(makeTestDoc('hello world'), new vscode.Range(0, 0, 0, 12)),
				true);
		});

		test('Should evaluate pasteAsMarkdownLink as false for a valid selected link', () => {
			assert.strictEqual(
				shouldSmartPaste(makeTestDoc('https://www.microsoft.com'), new vscode.Range(0, 0, 0, 25)),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for a valid selected link with trailing whitespace', () => {
			assert.strictEqual(
				shouldSmartPaste(makeTestDoc('   https://www.microsoft.com  '), new vscode.Range(0, 0, 0, 30)),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as true for a link pasted in square brackets', () => {
			assert.strictEqual(
				shouldSmartPaste(makeTestDoc('[abc]'), new vscode.Range(0, 1, 0, 4)),
				true);
		});

		test('Should evaluate pasteAsMarkdownLink as false for no selection', () => {
			assert.strictEqual(
				shouldSmartPaste(makeTestDoc('xyz'), new vscode.Range(0, 0, 0, 0)),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for selected whitespace and new lines', () => {
			assert.strictEqual(
				shouldSmartPaste(makeTestDoc('   \r\n\r\n'), new vscode.Range(0, 0, 0, 7)),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a backtick code block', () => {
			assert.strictEqual(
				shouldSmartPaste(makeTestDoc('```\r\n\r\n```'), new vscode.Range(0, 5, 0, 5)),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a tilde code block', () => {
			assert.strictEqual(
				shouldSmartPaste(makeTestDoc('~~~\r\n\r\n~~~'), new vscode.Range(0, 5, 0, 5)),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a math block', () => {
			assert.strictEqual(
				shouldSmartPaste(makeTestDoc('$$$\r\n\r\n$$$'), new vscode.Range(0, 5, 0, 5)),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a Markdown link', () => {
			assert.strictEqual(
				shouldSmartPaste(makeTestDoc('[a](bcdef)'), new vscode.Range(0, 4, 0, 6)),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a Markdown image link', () => {
			assert.strictEqual(
				shouldSmartPaste(makeTestDoc('![a](bcdef)'), new vscode.Range(0, 5, 0, 10)),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within inline code', () => {
			assert.strictEqual(
				shouldSmartPaste(makeTestDoc('``'), new vscode.Range(0, 1, 0, 1)),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within inline math', () => {
			assert.strictEqual(
				shouldSmartPaste(makeTestDoc('$$'), new vscode.Range(0, 1, 0, 1)),
				false);
		});
	});
});

function makeTestDoc(contents: string) {
	return new InMemoryDocument(vscode.Uri.file('test.md'), contents);
}
