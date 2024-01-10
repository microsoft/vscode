/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { InMemoryDocument } from '../client/inMemoryDocument';
import { PasteUrlAsMarkdownLink, findValidUriInText, shouldInsertMarkdownLinkByDefault } from '../languageFeatures/copyFiles/pasteUrlProvider';
import { createInsertUriListEdit } from '../languageFeatures/copyFiles/shared';

function makeTestDoc(contents: string) {
	return new InMemoryDocument(vscode.Uri.file('test.md'), contents);
}

suite('createEditAddingLinksForUriList', () => {

	test('Markdown Link Pasting should occur for a valid link (end to end)', async () => {
		// createEditAddingLinksForUriList -> checkSmartPaste -> tryGetUriListSnippet -> createUriListSnippet -> createLinkSnippet

		const result = createInsertUriListEdit(
			new InMemoryDocument(vscode.Uri.file('test.md'), 'hello world!'), [new vscode.Range(0, 0, 0, 12)], 'https://www.microsoft.com/');
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

	suite('createInsertUriListEdit', () => {

		test('Should create snippet with < > when pasted link has an mismatched parentheses', () => {
			const edit = createInsertUriListEdit(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], 'https://www.mic(rosoft.com');
			assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](<https://www.mic(rosoft.com>)');
		});

		test('Should create Markdown link snippet when pasteAsMarkdownLink is true', () => {
			const edit = createInsertUriListEdit(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], 'https://www.microsoft.com');
			assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](https://www.microsoft.com)');
		});

		test('Should use an unencoded URI string in Markdown link when passing in an external browser link', () => {
			const edit = createInsertUriListEdit(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], 'https://www.microsoft.com');
			assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](https://www.microsoft.com)');
		});

		test('Should not decode an encoded URI string when passing in an external browser link', () => {
			const edit = createInsertUriListEdit(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], 'https://www.microsoft.com/%20');
			assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](https://www.microsoft.com/%20)');
		});

		test('Should not encode an unencoded URI string when passing in an external browser link', () => {
			const edit = createInsertUriListEdit(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], 'https://www.example.com/path?query=value&another=value#fragment');
			assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](https://www.example.com/path?query=value&another=value#fragment)');
		});
	});


	suite('shouldInsertMarkdownLinkByDefault', () => {

		test('Smart should enabled for selected plain text', () => {
			assert.strictEqual(
				shouldInsertMarkdownLinkByDefault(makeTestDoc('hello world'), PasteUrlAsMarkdownLink.SmartWithSelection, [new vscode.Range(0, 0, 0, 12)]),
				true);
		});

		test('Smart should enabled for empty selection', () => {
			assert.strictEqual(
				shouldInsertMarkdownLinkByDefault(makeTestDoc('xyz'), PasteUrlAsMarkdownLink.Smart, [new vscode.Range(0, 0, 0, 0)]),
				true);
		});

		test('SmartWithSelection should disable for empty selection', () => {
			assert.strictEqual(
				shouldInsertMarkdownLinkByDefault(makeTestDoc('xyz'), PasteUrlAsMarkdownLink.SmartWithSelection, [new vscode.Range(0, 0, 0, 0)]),
				false);
		});

		test('Smart should disable for selected link', () => {
			assert.strictEqual(
				shouldInsertMarkdownLinkByDefault(makeTestDoc('https://www.microsoft.com'), PasteUrlAsMarkdownLink.SmartWithSelection, [new vscode.Range(0, 0, 0, 25)]),
				false);
		});

		test('Smart should disable for selected link with trailing whitespace', () => {
			assert.strictEqual(
				shouldInsertMarkdownLinkByDefault(makeTestDoc('   https://www.microsoft.com  '), PasteUrlAsMarkdownLink.SmartWithSelection, [new vscode.Range(0, 0, 0, 30)]),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as true for a link pasted in square brackets', () => {
			assert.strictEqual(
				shouldInsertMarkdownLinkByDefault(makeTestDoc('[abc]'), PasteUrlAsMarkdownLink.SmartWithSelection, [new vscode.Range(0, 1, 0, 4)]),
				true);
		});

		test('Should evaluate pasteAsMarkdownLink as false for selected whitespace and new lines', () => {
			assert.strictEqual(
				shouldInsertMarkdownLinkByDefault(makeTestDoc('   \r\n\r\n'), PasteUrlAsMarkdownLink.SmartWithSelection, [new vscode.Range(0, 0, 0, 7)]),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a backtick code block', () => {
			assert.strictEqual(
				shouldInsertMarkdownLinkByDefault(makeTestDoc('```\r\n\r\n```'), PasteUrlAsMarkdownLink.SmartWithSelection, [new vscode.Range(0, 5, 0, 5)]),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a tilde code block', () => {
			assert.strictEqual(
				shouldInsertMarkdownLinkByDefault(makeTestDoc('~~~\r\n\r\n~~~'), PasteUrlAsMarkdownLink.SmartWithSelection, [new vscode.Range(0, 5, 0, 5)]),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a math block', () => {
			assert.strictEqual(
				shouldInsertMarkdownLinkByDefault(makeTestDoc('$$$\r\n\r\n$$$'), PasteUrlAsMarkdownLink.SmartWithSelection, [new vscode.Range(0, 5, 0, 5)]),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a Markdown link', () => {
			assert.strictEqual(
				shouldInsertMarkdownLinkByDefault(makeTestDoc('[a](bcdef)'), PasteUrlAsMarkdownLink.SmartWithSelection, [new vscode.Range(0, 4, 0, 6)]),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a Markdown image link', () => {
			assert.strictEqual(
				shouldInsertMarkdownLinkByDefault(makeTestDoc('![a](bcdef)'), PasteUrlAsMarkdownLink.SmartWithSelection, [new vscode.Range(0, 5, 0, 10)]),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within inline code', () => {
			assert.strictEqual(
				shouldInsertMarkdownLinkByDefault(makeTestDoc('``'), PasteUrlAsMarkdownLink.SmartWithSelection, [new vscode.Range(0, 1, 0, 1)]),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within inline math', () => {
			assert.strictEqual(
				shouldInsertMarkdownLinkByDefault(makeTestDoc('$$'), PasteUrlAsMarkdownLink.SmartWithSelection, [new vscode.Range(0, 1, 0, 1)]),
				false);
		});
	});
});
