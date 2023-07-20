/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { checkSmartPaste, createLinkSnippet } from '../languageFeatures/copyFiles/shared';
import 'mocha';
import { validateLink } from '../languageFeatures/copyFiles/copyPasteLinks';

suite('uriToWorkspaceEdit', () => {

	// end to end test of checkSmartPaste & createLinkSnippet
	// check multicursor (end to end)

	// check paste with selection
	// check paste over markdown link
	// check paste over markdown image
	// check paste within markdown link
	// check paste with open bracket

	// check image link

	////////////////////////////////// validateLink tests //////////////////////////
	test('Markdown pasting should occur for a valid link.', () => {
		const isLink = validateLink('https://www.microsoft.com');
		assert.strictEqual(isLink, true);
	});

	test('Markdown pasting should not occur for a link following by text.', () => {
		const isLink = validateLink('https://www.microsoft.com hello world!');
		assert.strictEqual(isLink, false);
	});

	test('Markdown pasting should not occur for multiple links being pasted.', () => {
		const isLink = validateLink('https://www.microsoft.com\r\nhttps://www.microsoft.com\r\nhttps://www.microsoft.com\r\nhttps://www.microsoft.com');
		assert.strictEqual(isLink, false);
	});

	///////////////////////////////// createLinkSnippet tests //////////////////////

	test('Should not create Markdown link snippet when pasteAsMarkdownLink is false', () => {
		const uri = vscode.Uri.parse('https://www.microsoft.com');
		const snippet = createLinkSnippet(new vscode.SnippetString(''), false, 'https://www.microsoft.com', '', uri, 0);
		assert.strictEqual(snippet?.value, 'https://www.microsoft.com/');
	});

	test('Should create Markdown link snippet when pasteAsMarkdownLink is true', () => {
		const uri = vscode.Uri.parse('https://www.microsoft.com');
		const snippet = createLinkSnippet(new vscode.SnippetString(''), true, 'https://www.microsoft.com', '', uri, 0);
		assert.strictEqual(snippet?.value, '[${0:Title}](https://www.microsoft.com/)');
	});

	// Trying out test-driven development (I want to pass in a variable that indicates whether the url is an external browser link )
	// test('Should use an unencoded URI string in Markdown link when passing in an external browser link', () => {
	// 	const uri = vscode.Uri.parse('https://www.microsoft.com');
	// 	const snippet = createLinkSnippet(new vscode.SnippetString(''), true, 'https://www.microsoft.com', '', uri, 0, true);
	// 	assert.strictEqual(snippet?.value, '[${0:Title}](https://www.microsoft.com/)');
	// });

	///////////////////////////////// checkSmartPaste tests ///////////////////////

	// check smart paste
	test('Should evaluate pasteAsMarkdownLink as true for selected plain text', () => {
		const smartPaste = checkSmartPaste("hello! world", 0, 5);
		assert.strictEqual(smartPaste.pasteAsMarkdownLink, true);
	});

	test('Should evaluate updateTitle as true for selecting over a Markdown link', () => {
		const smartPaste = checkSmartPaste("[a](bc)", 0, 7);
		assert.strictEqual(smartPaste.updateTitle, true);
	});

	test('Should evaluate pasteAsMarkdownLink as false for selecting within a Markdown link', () => {
		const smartPaste = checkSmartPaste("[a](bcdef)", 4, 6);
		assert.strictEqual(smartPaste.pasteAsMarkdownLink, false);
	});
});
