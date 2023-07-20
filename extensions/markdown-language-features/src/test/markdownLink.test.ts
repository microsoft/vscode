/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as assert from 'assert';
import 'mocha';
import { checkSmartPaste, createLinkSnippet } from '../languageFeatures/copyFiles/shared';
import { validateLink } from '../languageFeatures/copyFiles/copyPasteLinks';

suite('createEditAddingLinksForUriList', () => {

	// end to end test of checkSmartPaste & createLinkSnippet
	// check multicursor (end to end)

	suite('validateLink', () => {

		test('Markdown pasting should occur for a valid link.', () => {
			const isLink = validateLink('https://www.microsoft.com');
			assert.strictEqual(isLink, true);
		});

		test('Markdown pasting should not occur for a valid hostname and invalid protool.', () => {
			const isLink = validateLink('invalid://www.microsoft.com');
			assert.strictEqual(isLink, false);
		});

		test('Markdown pasting should not occur for plain text.', () => {
			const isLink = validateLink('hello world!');
			assert.strictEqual(isLink, false);
		});

		test('Markdown pasting should not occur for plain text including a colon.', () => {
			const isLink = validateLink('hello: world!');
			assert.strictEqual(isLink, false);
		});

		test('Markdown pasting should not occur for plain text including a slashes.', () => {
			const isLink = validateLink('hello//world!');
			assert.strictEqual(isLink, false);
		});

		test('Markdown pasting should not occur for a link followed by text.', () => {
			const isLink = validateLink('https://www.microsoft.com hello world!');
			assert.strictEqual(isLink, false);
		});

		test('Markdown pasting should not occur for a link preceded or followed by spaces.', () => {
			const isLink = validateLink('    https://www.microsoft.com   ');
			assert.strictEqual(isLink, false);
		});

		test('Markdown pasting should not occur for a link with an invalid scheme.', () => {
			const isLink = validateLink('hello://www.microsoft.com');
			assert.strictEqual(isLink, false);
		});

		test('Markdown pasting should not occur for multiple links being pasted.', () => {
			const isLink = validateLink('https://www.microsoft.com\r\nhttps://www.microsoft.com\r\nhttps://www.microsoft.com\r\nhttps://www.microsoft.com');
			assert.strictEqual(isLink, false);
		});

	});

	suite('createLinkSnippet', () => {
		test('Should not create Markdown link snippet when pasteAsMarkdownLink is false', () => {
			const uri = vscode.Uri.parse('https://www.microsoft.com');
			const snippet = createLinkSnippet(false, 'https://www.microsoft.com', '', uri, 0, true);
			assert.strictEqual(snippet?.value, 'https://www.microsoft.com/');
		});

		test('Should create Markdown link snippet when pasteAsMarkdownLink is true', () => {
			const uri = vscode.Uri.parse('https://www.microsoft.com');
			const snippet = createLinkSnippet(true, 'https://www.microsoft.com', '', uri, 0, true);
			assert.strictEqual(snippet?.value, '[${0:Title}](https://www.microsoft.com/)');
		});

		test('Should use an unencoded URI string in Markdown link when passing in an external browser link', () => {
			const uri = vscode.Uri.parse('https://www.microsoft.com');
			const snippet = createLinkSnippet(true, 'https://www.microsoft.com', '', uri, 0, true);
			assert.strictEqual(snippet?.value, '[${0:Title}](https://www.microsoft.com/)');
		});
	});

	suite('pasteAsMarkdownLink', () => {

		test('Should evaluate pasteAsMarkdownLink as true for selected plain text', () => {
			const smartPaste = checkSmartPaste("hello! world", 0, 5);
			assert.strictEqual(smartPaste.pasteAsMarkdownLink, true);
		});


		test('Should evaluate updateTitle as true for pasting over a Markdown link', () => {
			const smartPaste = checkSmartPaste("[a](bc)", 0, 7);
			assert.strictEqual(smartPaste.updateTitle, true);
		});

		test('Should evaluate updateTitle as true for pasting over a Markdown image link', () => {
			const smartPaste = checkSmartPaste("![a](bc)", 0, 8);
			assert.strictEqual(smartPaste.updateTitle, true);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a Markdown link', () => {
			const smartPaste = checkSmartPaste("[a](bcdef)", 4, 6);
			assert.strictEqual(smartPaste.pasteAsMarkdownLink, false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a Markdown image link', () => {
			const smartPaste = checkSmartPaste('![alt](https://)', 7, 15);
			assert.strictEqual(smartPaste.pasteAsMarkdownLink, false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a code block', () => {
			const smartPaste = checkSmartPaste('```\r\n\r\n```', 5, 5);
			assert.strictEqual(smartPaste.pasteAsMarkdownLink, false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within inline code', () => {
			const smartPaste = checkSmartPaste('``', 1, 1);
			assert.strictEqual(smartPaste.pasteAsMarkdownLink, false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within a math block', () => {
			const smartPaste = checkSmartPaste('$$$\r\n\r\n$$$', 5, 5);
			assert.strictEqual(smartPaste.pasteAsMarkdownLink, false);
		});

		test('Should evaluate pasteAsMarkdownLink as false for pasting within inline math', () => {
			const smartPaste = checkSmartPaste('$$', 1, 1);
			assert.strictEqual(smartPaste.pasteAsMarkdownLink, false);
		});
	});
});
