/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { InMemoryDocument } from '../client/inMemoryDocument';
import { createInsertUriListEdit } from '../languageFeatures/copyFiles/shared';
import { InsertMarkdownLink, findValidUriInText, shouldInsertMarkdownLinkByDefault } from '../languageFeatures/copyFiles/smartDropOrPaste';
import { noopToken } from '../util/cancellation';
import { UriList } from '../util/uriList';
import { createNewMarkdownEngine } from './engine';

function makeTestDoc(contents: string) {
	return new InMemoryDocument(vscode.Uri.file('test.md'), contents);
}

suite('createEditAddingLinksForUriList', () => {

	test('Markdown Link Pasting should occur for a valid link (end to end)', async () => {
		// createEditAddingLinksForUriList -> checkSmartPaste -> tryGetUriListSnippet -> createUriListSnippet -> createLinkSnippet

		const result = createInsertUriListEdit(
			new InMemoryDocument(vscode.Uri.file('test.md'), 'hello world!'), [new vscode.Range(0, 0, 0, 12)], UriList.from('https://www.microsoft.com/'));
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
			const edit = createInsertUriListEdit(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], UriList.from('https://www.mic(rosoft.com'));
			assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](<https://www.mic(rosoft.com>)');
		});

		test('Should create Markdown link snippet when pasteAsMarkdownLink is true', () => {
			const edit = createInsertUriListEdit(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], UriList.from('https://www.microsoft.com'));
			assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](https://www.microsoft.com)');
		});

		test('Should use an unencoded URI string in Markdown link when passing in an external browser link', () => {
			const edit = createInsertUriListEdit(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], UriList.from('https://www.microsoft.com'));
			assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](https://www.microsoft.com)');
		});

		test('Should not decode an encoded URI string when passing in an external browser link', () => {
			const edit = createInsertUriListEdit(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], UriList.from('https://www.microsoft.com/%20'));
			assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](https://www.microsoft.com/%20)');
		});

		test('Should not encode an unencoded URI string when passing in an external browser link', () => {
			const edit = createInsertUriListEdit(makeTestDoc(''), [new vscode.Range(0, 0, 0, 0)], UriList.from('https://www.example.com/path?query=value&another=value#fragment'));
			assert.strictEqual(edit?.edits?.[0].snippet.value, '[${1:text}](https://www.example.com/path?query=value&another=value#fragment)');
		});
	});


	suite('shouldInsertMarkdownLinkByDefault', () => {

		test('Smart should be enabled for selected plain text', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('hello world'), InsertMarkdownLink.SmartWithSelection, [new vscode.Range(0, 0, 0, 12)], noopToken),
				true);
		});

		test('Smart should be enabled in headers', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('# title'), InsertMarkdownLink.Smart, [new vscode.Range(0, 2, 0, 2)], noopToken),
				true);
		});

		test('Smart should be enabled in lists', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('1. text'), InsertMarkdownLink.Smart, [new vscode.Range(0, 3, 0, 3)], noopToken),
				true);
		});

		test('Smart should be enabled in blockquotes', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('> text'), InsertMarkdownLink.Smart, [new vscode.Range(0, 3, 0, 3)], noopToken),
				true);
		});

		test('Smart should be disabled in indented code blocks', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('    code'), InsertMarkdownLink.Smart, [new vscode.Range(0, 4, 0, 4)], noopToken),
				false);
		});

		test('Smart should be disabled in fenced code blocks', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('```\r\n\r\n```'), InsertMarkdownLink.Smart, [new vscode.Range(0, 5, 0, 5)], noopToken),
				false);

			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('~~~\r\n\r\n~~~'), InsertMarkdownLink.Smart, [new vscode.Range(0, 5, 0, 5)], noopToken),
				false);
		});

		test('Smart should be disabled in math blocks', async () => {
			const katex = (await import('@vscode/markdown-it-katex')).default;
			const engine = createNewMarkdownEngine();
			(await engine.getEngine(undefined)).use(katex);
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(engine, makeTestDoc('$$\r\n\r\n$$'), InsertMarkdownLink.Smart, [new vscode.Range(0, 5, 0, 5)], noopToken),
				false);
		});

		test('Smart should be disabled in link definitions', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('[ref]: http://example.com'), InsertMarkdownLink.Smart, [new vscode.Range(0, 4, 0, 6)], noopToken),
				false);

			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('[ref]: '), InsertMarkdownLink.Smart, [new vscode.Range(0, 7, 0, 7)], noopToken),
				false);

			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('[ref]: '), InsertMarkdownLink.Smart, [new vscode.Range(0, 0, 0, 0)], noopToken),
				false);
		});

		test('Smart should be disabled in html blocks', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('<p>\na\n</p>'), InsertMarkdownLink.Smart, [new vscode.Range(1, 0, 1, 0)], noopToken),
				false);
		});

		test('Smart should be disabled in html blocks where paste creates the block', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('<p>\n\n</p>'), InsertMarkdownLink.Smart, [new vscode.Range(1, 0, 1, 0)], noopToken),
				false,
				'Between two html tags should be treated as html block');

			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('<p>\n\ntext'), InsertMarkdownLink.Smart, [new vscode.Range(1, 0, 1, 0)], noopToken),
				false,
				'Between opening html tag and text should be treated as html block');

			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('<p>\n\n\n</p>'), InsertMarkdownLink.Smart, [new vscode.Range(1, 0, 1, 0)], noopToken),
				true,
				'Extra new line after paste should not be treated as html block');
		});

		test('Smart should be disabled in Markdown links', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('[a](bcdef)'), InsertMarkdownLink.Smart, [new vscode.Range(0, 4, 0, 6)], noopToken),
				false);
		});

		test('Smart should be disabled in Markdown images', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('![a](bcdef)'), InsertMarkdownLink.Smart, [new vscode.Range(0, 5, 0, 10)], noopToken),
				false);
		});

		test('Smart should be disabled in inline code', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('``'), InsertMarkdownLink.Smart, [new vscode.Range(0, 1, 0, 1)], noopToken),
				false,
				'Should be disabled inside of inline code');

			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('``'), InsertMarkdownLink.Smart, [new vscode.Range(0, 0, 0, 0)], noopToken),
				true,
				'Should be enabled when cursor is outside but next to inline code');

			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('`a`'), InsertMarkdownLink.Smart, [new vscode.Range(0, 3, 0, 3)], noopToken),
				true,
				'Should be enabled when cursor is outside but next to inline code');
		});

		test('Smart should be enabled when pasting over inline code ', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('`xyz`'), InsertMarkdownLink.Smart, [new vscode.Range(0, 0, 0, 5)], noopToken),
				true);
		});

		test('Smart should be disabled in inline math', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('$$'), InsertMarkdownLink.SmartWithSelection, [new vscode.Range(0, 1, 0, 1)], noopToken),
				false);
		});

		test('Smart should be enabled for empty selection', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('xyz'), InsertMarkdownLink.Smart, [new vscode.Range(0, 0, 0, 0)], noopToken),
				true);
		});

		test('SmartWithSelection should disable for empty selection', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('xyz'), InsertMarkdownLink.SmartWithSelection, [new vscode.Range(0, 0, 0, 0)], noopToken),
				false);
		});

		test('Smart should disable for selected link', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('https://www.microsoft.com'), InsertMarkdownLink.SmartWithSelection, [new vscode.Range(0, 0, 0, 25)], noopToken),
				false);
		});

		test('Smart should disable for selected link with trailing whitespace', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('   https://www.microsoft.com  '), InsertMarkdownLink.SmartWithSelection, [new vscode.Range(0, 0, 0, 30)], noopToken),
				false);
		});

		test('Should evaluate pasteAsMarkdownLink as true for a link pasted in square brackets', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('[abc]'), InsertMarkdownLink.SmartWithSelection, [new vscode.Range(0, 1, 0, 4)], noopToken),
				true);
		});

		test('Should evaluate pasteAsMarkdownLink as false for selected whitespace and new lines', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('   \r\n\r\n'), InsertMarkdownLink.SmartWithSelection, [new vscode.Range(0, 0, 0, 7)], noopToken),
				false);
		});

		test('Smart should be disabled inside of autolinks', async () => {
			assert.strictEqual(
				await shouldInsertMarkdownLinkByDefault(createNewMarkdownEngine(), makeTestDoc('<>'), InsertMarkdownLink.Smart, [new vscode.Range(0, 1, 0, 1)], noopToken),
				false);
		});
	});
});
